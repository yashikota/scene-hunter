// handlers/roundEndHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { Round, RoomState } from '../types';

export async function handleRoundEnd(
  storage: DurableObjectStorage,
  request: Request,
  roundId: string
): Promise<Response> {
  try {
    // 認証チェック
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // リクエストボディの解析（必要に応じて）
    // const body = await request.json();
    
    // ラウンド情報の取得
    const round = await storage.get<Round>(`round:${roundId}`);
    if (!round) {
      return new Response('Round not found', { status: 404 });
    }
    
    // ラウンドが既に終了していないか確認
    if (round.state === 'ended') {
      return new Response('Round already ended', { status: 400 });
    }
    
    // ルーム情報の取得
    const room = await storage.get<RoomState>(`room:${round.room_id}`);
    if (!room) {
      return new Response('Room not found', { status: 404 });
    }
    
    // ラウンドを終了状態に更新
    round.state = 'ended';
    round.end_time = new Date().toISOString();
    
    // スコア計算と順位付け
    // スコアの高い順にソート
    const sortedSubmissions = [...round.submissions].sort((a, b) => 
      b.total_score - a.total_score
    );
    
    // 各プレイヤーのスコアをルームのplayers配列に反映
    sortedSubmissions.forEach(submission => {
      const playerIndex = room.players.findIndex(p => p.player_id === submission.player_id);
      if (playerIndex !== -1) {
        // このラウンドのスコアを加算
        // room.players[playerIndex].score += submission.total_score;
        // 既にhandleRoundPhotoで加算済みの場合はここではスキップ
      }
    });
    
    // すべてのラウンドが終了したかチェック
    const isLastRound = room.currentRound >= room.rounds;
    if (isLastRound) {
      room.status = 'finished';
    } else {
      room.status = 'waiting'; // 次のラウンドのために待機状態に
    }
    
    // ラウンド状態の更新
    if (room.roundStates) {
      room.roundStates[roundId] = round;
    }
    
    // ストレージに保存
    await storage.put(`round:${roundId}`, round);
    await storage.put(`room:${room.id}`, room);
    
    // ラウンド結果の構築
    const roundResults = {
      round_id: round.round_id,
      round_number: round.round_number,
      room_id: round.room_id,
      end_time: round.end_time,
      is_last_round: isLastRound,
      master_photo_url: `https://your-storage-url.com/${round.master_photo_id}`,
      results: sortedSubmissions.map((submission, index) => {
        const player = room.players.find(p => p.player_id === submission.player_id);
        return {
          rank: index + 1,
          player_id: submission.player_id,
          player_name: player ? player.name : 'Unknown',
          photo_url: `https://your-storage-url.com/${submission.photo_id}`,
          match_score: submission.match_score,
          remaining_seconds: submission.remaining_seconds,
          total_score: submission.total_score
        };
      }),
      // 参加しなかったプレイヤーも表示
      non_participants: room.players
        .filter(player => 
          player.role !== 'gamemaster' && 
          !round.submissions.some(sub => sub.player_id === player.player_id)
        )
        .map(player => ({
          player_id: player.player_id,
          player_name: player.name,
          score: 0
        }))
    };
    
    return new Response(JSON.stringify(roundResults), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in handleRoundEnd:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
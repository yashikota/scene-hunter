// handlers/leaderboardHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { RoomState, Player } from '../types';

export async function handleLeaderboard(
  storage: DurableObjectStorage,
  request: Request
): Promise<Response> {
  try {
    // 認証チェック
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // ルームIDをリクエストから取得（URLまたはクエリパラメータから）
    const url = new URL(request.url);
    const roomId = url.searchParams.get('room_id');
    
    if (!roomId) {
      return new Response('Missing room_id', { status: 400 });
    }
    
    // ルームの取得
    const room = await storage.get<RoomState>(`room:${roomId}`);
    if (!room) {
      return new Response('Room not found', { status: 404 });
    }
    
    // ゲームマスターを除外してプレイヤーをスコア順に並べ替え
    const players = [...room.players]
      .filter(player => player.role !== 'gamemaster')
      .sort((a, b) => b.score - a.score);
    
    // 同点の場合は同じ順位を割り当て
    let currentRank = 1;
    let previousScore = -1;
    const leaderboard = players.map((player, index) => {
      // 前のプレイヤーと点数が異なる場合は新しい順位を割り当て
      if (player.score !== previousScore) {
        currentRank = index + 1;
      }
      previousScore = player.score;
      
      return {
        rank: currentRank,
        player_id: player.player_id,
        player_name: player.name,
        score: player.score
      };
    });
    
    // ゲームマスター情報
    const gamemaster = room.players.find(player => player.role === 'gamemaster');
    
    // レスポンスデータの構築
    const responseData = {
      room_id: room.id,
      room_code: room.code,
      status: room.status,
      current_round: room.currentRound,
      total_rounds: room.rounds,
      gamemaster: gamemaster ? {
        player_id: gamemaster.player_id,
        player_name: gamemaster.name
      } : null,
      leaderboard
    };
    
    return new Response(JSON.stringify(responseData), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in handleLeaderboard:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
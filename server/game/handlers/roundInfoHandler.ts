// handlers/roundInfoHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { Round } from '../types';

export async function handleRoundInfo(
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
    
    // ラウンド情報の取得
    const round = await storage.get<Round>(`round:${roundId}`);
    if (!round) {
      return new Response('Round not found', { status: 404 });
    }
    
    // 現在のラウンド状態を確認
    const isGameInProgress = round.state === 'in_progress';
    
    // 現在の時間とラウンド開始時間の差分を計算
    const startTime = new Date(round.start_time).getTime();
    const currentTime = Date.now();
    const elapsedSeconds = (currentTime - startTime) / 1000;
    
    // 10秒ごとに新しいヒントを開示 (最大5つ)
    // 0秒: 1つ目のヒント
    // 10秒: 2つ目のヒント
    // 20秒: 3つ目のヒント
    // 30秒: 4つ目のヒント
    // 40秒: 5つ目のヒント
    const revealedHintsCount = Math.min(5, Math.floor(elapsedSeconds / 10) + 1);
    
    // ラウンドがアクティブな場合のみヒント数を更新
    if (isGameInProgress && revealedHintsCount > round.revealed_hints) {
      round.revealed_hints = revealedHintsCount;
      await storage.put(`round:${roundId}`, round);
    }
    
    // ラウンドの残り時間（60秒制限）
    const remainingSeconds = Math.max(0, 60 - elapsedSeconds);
    const isTimeUp = remainingSeconds <= 0;
    
    // 返却するヒント（現在開示されているもののみ）
    const visibleHints = round.hints.slice(0, round.revealed_hints);
    
    // ゲームマスターが提出した写真のURL（実際の実装に合わせて調整）
    // 注: ゲームマスターの写真は、ラウンド終了後にのみハンターに見せる
    const masterPhotoUrl = round.state === 'ended' 
      ? `https://scene-hunter-image.yashikota.workers.dev/file/${round.master_photo_id}`
      : null;
    
    // 提出状況（player_idとscoreのみ）
    const submissions = round.submissions.map(sub => ({
      player_id: sub.player_id,
      match_score: sub.match_score,
      total_score: sub.total_score,
      submission_time: sub.submission_time,
      // ラウンドが終了している場合のみ写真URLを含める
      photo_url: round.state === 'ended' ? `https://scene-hunter-image.yashikota.workers.dev/file/${sub.photo_id}` : null
    }));
    
    // 返却するデータを構築
    const responseData = {
      round_id: round.round_id,
      round_number: round.round_number,
      room_id: round.room_id,
      state: round.state,
      start_time: round.start_time,
      end_time: round.end_time,
      elapsed_seconds: Math.floor(elapsedSeconds),
      remaining_seconds: Math.floor(remainingSeconds),
      is_time_up: isTimeUp,
      hints: visibleHints,
      revealed_hints_count: round.revealed_hints,
      total_hints_count: round.hints.length,
      master_photo_url: masterPhotoUrl,
      submissions
    };
    
    return new Response(JSON.stringify(responseData), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in handleRoundInfo:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
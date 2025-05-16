// handlers/roundEndHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState } from '../types';

// roundEndHandler.ts
export async function handleRoundEnd(
  context: { room: RoomState; storage: DurableObjectStorage;},
  request: Request,
  roundId: string
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // 認証チェック（例: 管理者のみ許可）
  const authPlayerId = 'TODO'; // トークンから取得
  if (context.room.host_internal_id !== authPlayerId) {
    return new Response('Forbidden', { status: 403 });
  }

  return Response.json({ success: true });
}
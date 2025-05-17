import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { Player } from '../types';

interface UpdateNameRequest {
  name: string;
}

export async function handleUpdatePlayerName(
  storage: DurableObjectStorage,
  request: Request,
  playerId: string
): Promise<Response> {

  let body: UpdateNameRequest;
  try {
    body = await request.json() as UpdateNameRequest;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { name } = body;
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 12) {
    return new Response(JSON.stringify({ error: 'Invalid name length (1-12 characters)' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // プレイヤー一覧を取得
  const room = await storage.get<any>('room');
  if (!room || !room.players || !Array.isArray(room.players)) {
    return new Response(JSON.stringify({ error: 'Room or players not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const playerIndex = room.players.findIndex((p: Player) => p.player_id === playerId);
  if (playerIndex === -1) {
    return new Response(JSON.stringify({ error: 'Player not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  // 名前を更新
  room.players[playerIndex].name = name.trim();

  await storage.put('room', room);

  const updatedPlayer = room.players[playerIndex];
  return new Response(JSON.stringify({
    player_id: updatedPlayer.player_id,
    name: updatedPlayer.name,
    created_at: updatedPlayer.created_at || Date.now(), // created_at が存在しない場合は仮で現在時刻
    total_score: updatedPlayer.score ?? 0
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

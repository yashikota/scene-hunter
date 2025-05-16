// handlers/roomStartHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState, RoundState } from '../types';

export async function handleRoomStart(
  storage: DurableObjectStorage,
  request: Request,
  roomIdFromPath: string // URLから抽出されたroomId (Durable ObjectのID/nameと一致する想定)
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = (await request.json()) as { gamemaster_id?: string };
    const gamemaster_id = body.gamemaster_id;
    if (!gamemaster_id) {
      return new Response('Missing gamemaster_id', { status: 400 });
    }

    const room = await storage.get<RoomState>('room');
    if (!room) {
      return new Response('Room not found', { status: 404 });
    }

    // Optional: Check if roomIdFromPath matches room.id if they are supposed to be different
    // if (room.id !== roomIdFromPath) {
    //   return new Response('Room ID mismatch', { status: 400 });
    // }

    if (gamemaster_id !== room.host_internal_id) {
      return new Response('Forbidden: Only the host can start the game', { status: 403 });
    }

    const inProgressRound = Object.values(room.round_states || {}).find(r => r.status === 'gamemaster_turn' || r.status === 'hunter_turn');
    if (inProgressRound) {
      return new Response('Another round is already in progress', { status: 400 });
    }

    const playedRoundNumbers = new Set(Object.values(room.round_states || {}).map(r => r.round_number));
    if (room.total_rounds !== undefined && playedRoundNumbers.size >= room.total_rounds) {
      return new Response('All rounds have already been played', { status: 400 });
    }

    const nextRoundNumber = playedRoundNumbers.size > 0 ? Math.max(...playedRoundNumbers) + 1 : 1;
    const newRoundId = crypto.randomUUID();

    const newRound: RoundState = {
      round_id: newRoundId,
      room_id: room.internal_room_id,
      round_number: nextRoundNumber,
      gamemaster_internal_id: gamemaster_id,
      status: 'gamemaster_turn',
      ai_generated_hints: [],
      revealed_hints_count: 0,
      hunter_submissions: {},
      turn_start_time: new Date().toISOString(),
      // 他のプロパティは未設定
    };

    room.round_states = room.round_states || {};
    room.round_states[newRoundId] = newRound;
    room.current_round_number = nextRoundNumber;
    room.game_status = 'in_progress';

    await storage.put('room', room);

    return Response.json(newRound);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return new Response(`Error starting room: ${errorMsg}`, { status: 500 });
  }
}
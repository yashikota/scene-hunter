// handlers/roomStartHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState, Round } from '../types';

export async function handleRoomStart(
  storage: DurableObjectStorage,
  request: Request,
  roomIdFromPath: string // URLから抽出されたroomId (Durable ObjectのID/nameと一致する想定)
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    let body: { gamemaster_id?: string };
    try {
      body = await request.json() as { gamemaster_id?: string };
    } catch {
      return new Response('Invalid request body', { status: 400 });
    }
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

    if (gamemaster_id !== room.host) {
      return new Response('Forbidden: Only the host can start the game', { status: 403 });
    }

    const inProgressRound = Object.values(room.roundStates || {}).find(r => r.state === 'in_progress');
    if (inProgressRound) {
      return new Response('Another round is already in progress', { status: 400 });
    }

    const playedRoundNumbers = new Set(Object.values(room.roundStates || {}).map(r => r.round_number));
    if (room.rounds !== undefined && playedRoundNumbers.size >= room.rounds) {
      return new Response('All rounds have already been played', { status: 400 });
    }

    const nextRoundNumber = playedRoundNumbers.size > 0 ? Math.max(...playedRoundNumbers) + 1 : 1;
    const newRoundId = crypto.randomUUID();

    const newRound: Round = {
      round_id: newRoundId,
      room_id: room.id, // Use the stored room ID
      round_number: nextRoundNumber,
      start_time: new Date().toISOString(),
      end_time: '',
      state: 'in_progress',
      master_photo_id: '', // To be set later, perhaps
      hints: [],
      revealed_hints: 0,
      submissions: [],
    };

    room.roundStates = room.roundStates || {};
    room.roundStates[newRoundId] = newRound;
    room.currentRound = nextRoundNumber;
    // room.status = 'in_progress'; // Consider updating room status

    await storage.put('room', room);

    return Response.json(newRound);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return new Response(`Error starting room: ${errorMsg}`, { status: 500 });
  }
}
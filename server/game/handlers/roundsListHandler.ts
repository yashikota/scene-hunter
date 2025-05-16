// handlers/roundsListHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState, RoundState } from '../types';

interface RoundListItem {
    round_id: string;
    round_number: number;
    status: 'pending' | 'gamemaster_turn' | 'hunter_turn' | 'scoring' | 'completed' | 'cancelled';
    turn_start_time?: string;
    turn_expires_at?: string;
}

export async function handleRoundsList(storage: DurableObjectStorage, request: Request): Promise<Response> {
    if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const room = await storage.get<RoomState>('room');
        if (!room || !room.round_states) {
            return new Response('Room or rounds not found', { status: 404 });
        }

        const rounds: RoundListItem[] = Object.values(room.round_states).map((round: RoundState) => ({
            round_id: round.round_id,
            round_number: round.round_number,
            status: round.status,
            turn_start_time: round.turn_start_time,
            turn_expires_at: round.turn_expires_at,
        }));

        rounds.sort((a, b) => a.round_number - b.round_number);

        return Response.json({ rounds });
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error fetching rounds list: ${error}`, { status: 500 });
    }
}
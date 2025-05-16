// handlers/roundInfoHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState, RoundState } from '../types';

export async function handleRoundInfo(
    storage: DurableObjectStorage,
    request: Request,
    roundId: string
): Promise<Response> {
    if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const stored = await storage.get<RoomState>('room');
        if (!stored || !stored.round_states || !stored.round_states[roundId]) {
            return new Response('Round not found', { status: 404 });
        }

        const round: RoundState = stored.round_states[roundId];

        const responseData = {
            round_id: round.round_id,
            room_id: round.room_id,
            round_number: round.round_number,
            gamemaster_internal_id: round.gamemaster_internal_id,
            status: round.status,
            master_photo_id: round.master_photo_id,
            master_photo_submitted_at: round.master_photo_submitted_at,
            ai_generated_hints: round.ai_generated_hints,
            revealed_hints_count: round.revealed_hints_count,
            turn_start_time: round.turn_start_time,
            turn_expires_at: round.turn_expires_at,
            next_hint_reveal_time: round.next_hint_reveal_time,
            hunter_submissions: round.hunter_submissions,
            // scoring_completed_at: round.scoring_completed_at, // 必要に応じて
            // results: round.results, // 必要に応じて
        };

        return Response.json(responseData);
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error fetching round info: ${error}`, { status: 500 });
    }
}
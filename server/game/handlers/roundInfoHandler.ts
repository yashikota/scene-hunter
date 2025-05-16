// handlers/roundInfoHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState, Round } from '../types';

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
        if (!stored || !stored.roundStates || !stored.roundStates[roundId]) {
            return new Response('Round not found', { status: 404 });
        }

        const round: Round = stored.roundStates[roundId];

        // レスポンスに必要な情報だけを選んで返す (元のコードに準拠)
        const responseData = {
            round_id: round.round_id,
            room_id: round.room_id,
            round_number: round.round_number,
            start_time: round.start_time,
            end_time: round.end_time,
            state: round.state,
            master_photo_id: round.master_photo_id,
            hints: round.hints,
            revealed_hints: round.revealed_hints,
            submissions: round.submissions,
        };

        return Response.json(responseData);
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error fetching round info: ${error}`, { status: 500 });
    }
}
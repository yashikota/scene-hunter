// handlers/roundsListHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState, Round } from '../types';

interface RoundListItem {
    round_id: string;
    round_number: number;
    state: 'in_progress' | 'ended' | 'pending';
    start_time: string;
    end_time: string;
}

export async function handleRoundsList(storage: DurableObjectStorage, request: Request): Promise<Response> {
    if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const room = await storage.get<RoomState>('room');
        if (!room || !room.roundStates) {
            // roundStates が存在しない場合は空の配列を返すか、404を返すか選択
            // 元のコードでは 404 だったのでそれに合わせる
            return new Response('Room or rounds not found', { status: 404 });
        }

        const rounds: RoundListItem[] = Object.values(room.roundStates).map((round: Round) => ({
            round_id: round.round_id,
            round_number: round.round_number,
            state: round.state,
            start_time: round.start_time,
            end_time: round.end_time,
        }));

        // 必要に応じてソート
        rounds.sort((a, b) => a.round_number - b.round_number);

        return Response.json({ rounds });
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error fetching rounds list: ${error}`, { status: 500 });
    }
}
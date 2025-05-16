// handlers/roomInfoHandler.ts
import type { DurableObjectStorage} from '@cloudflare/workers-types';
import type { RoomState } from '../types';

export async function handleRoomInfo(storage: DurableObjectStorage, request: Request): Promise<Response> {
    if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const stored = await storage.get<RoomState>('room');
        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        // レスポンスに含める情報を整形（RoomState型に準拠）
        const result: Partial<Omit<RoomState, 'players'>> & { players: any[] } = {
            code: stored.code,
            internal_room_id: stored.internal_room_id,
            host_internal_id: stored.host_internal_id,
            players: stored.players
                ? Object.values(stored.players).map((player) => ({
                    player_id: player.player_id,
                    name: player.name,
                    role: player.role,
                    score: player.points_current_round,
                }))
                : [],
            game_status: stored.game_status,
            current_round_number: stored.current_round_number,
            total_rounds: stored.total_rounds,
            round_states: stored.round_states ?? undefined,
            settings: stored.settings,
            created_at: stored.created_at,
        };

        return Response.json(result);
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error fetching room info: ${error}`, { status: 500 });
    }
}
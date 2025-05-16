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

        // レスポンスに含める情報を整形（元のコードに準拠）
        const result: Partial<RoomState> = { // 全部返す場合は Partial 不要
            id: stored.id,
            code: stored.code,
            host: stored.host,
            players: stored.players.map((player) => ({
                player_id: player.player_id,
                name: player.name,
                role: player.role,
                score: player.score,
            })),
            status: stored.status,
            createdAt: stored.createdAt,
            maxPlayers: stored.maxPlayers,
            rounds: stored.rounds,
            currentRound: stored.currentRound,
            roundStates: stored.roundStates ?? undefined,
        };

        return Response.json(result);
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error fetching room info: ${error}`, { status: 500 });
    }
}
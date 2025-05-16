// handlers/leaderboardHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState, Player } from '../types';

interface LeaderboardPlayer {
    player_id: string;
    name: string;
    total_score: number;
    rank: number;
}

export async function handleLeaderboard(storage: DurableObjectStorage, request: Request): Promise<Response> {
    if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const stored = await storage.get<RoomState>('room');
        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        if (!Array.isArray(stored.players) || stored.players.length === 0) {
            return Response.json({ players: [] });
        }

        const sortedPlayers: LeaderboardPlayer[] = [...stored.players]
            .sort((a, b) => (b.total_points_all_rounds ?? 0) - (a.total_points_all_rounds ?? 0))
            .map((p, index) => ({
                player_id: p.player_id,
                name: p.name ?? '', // name がない場合を考慮
                total_score: p.total_points_all_rounds ?? 0,
                rank: index + 1, // 1-based rank
            }));

        return Response.json({ players: sortedPlayers });
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error fetching leaderboard: ${error}`, { status: 500 });
    }
}
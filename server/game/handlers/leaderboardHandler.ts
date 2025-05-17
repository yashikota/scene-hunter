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

        if (!stored.players || stored.players.length === 0) {
            return Response.json({ players: [] });
        }

        // 各プレイヤーのスコアを最新のラウンド提出データから計算
        let playerScoreMap: Record<string, number> = {};
        if (stored.roundStates) {
            for (const round of Object.values(stored.roundStates)) {
                if (round.submissions && Array.isArray(round.submissions)) {
                    for (const sub of round.submissions) {
                        if (typeof sub.player_id === 'string' && typeof sub.total_score === 'number') {
                            // 最新のスコアで上書き（複数ラウンドなら合計したい場合は += に変更）
                            playerScoreMap[sub.player_id] = (playerScoreMap[sub.player_id] || 0) + sub.total_score;
                        }
                    }
                }
            }
        }

        const sortedPlayers: LeaderboardPlayer[] = [...stored.players]
            .map((p) => ({
                player_id: p.player_id,
                name: p.name ?? '',
                total_score: playerScoreMap[p.player_id] ?? 0,
            }))
            .sort((a, b) => b.total_score - a.total_score)
            .map((p, index) => ({ ...p, rank: index + 1 }));

        return Response.json({ players: sortedPlayers });
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error fetching leaderboard: ${error}`, { status: 500 });
    }
}
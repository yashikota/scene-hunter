// handlers/testRankHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState, Player } from '../types';

export async function handleTestRank(storage: DurableObjectStorage, request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        // テスト用なのでGETでも良いかもしれないが、元のコードに合わせてPOST
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const stored = await storage.get<RoomState>('room');
        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        const updatedPlayers = Array.isArray(stored.players)
            ? stored.players.map((p: Player) => ({
                ...p,
                score: Math.floor(Math.random() * 101), // 0〜100のランダムスコア
            }))
            : [];

        const updatedPlayersObj: { [internal_id: string]: Player } = {};
        if (Array.isArray(stored.players)) {
            stored.players.forEach((p: Player, idx: number) => {
                const internal_id = (p as any).internal_id ?? idx.toString();
                updatedPlayersObj[internal_id] = updatedPlayers[idx];
            });
        }

        stored.players = updatedPlayersObj;
        await storage.put('room', stored);

        return Response.json({ success: true, players: Object.values(updatedPlayersObj) });
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error applying test rank: ${error}`, { status: 500 });
    }
}
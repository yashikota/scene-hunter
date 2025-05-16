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

        const updatedPlayers = stored.players.map((p: Player) => ({
            ...p,
            score: Math.floor(Math.random() * 101), // 0〜100のランダムスコア
        }));

        stored.players = updatedPlayers;
        await storage.put('room', stored);

        return Response.json({ success: true, players: updatedPlayers });
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error applying test rank: ${error}`, { status: 500 });
    }
}
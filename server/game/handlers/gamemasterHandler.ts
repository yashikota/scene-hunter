// handlers/gamemasterHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState } from '../types';

export async function handleGamemaster(storage: DurableObjectStorage, request: Request): Promise<Response> {
    if (request.method !== 'PUT') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { player_id } = await (request.json() as Promise<{ player_id?: string }>);
        if (!player_id) {
            return new Response('Missing player_id', { status: 400 });
        }

        const stored = await storage.get<RoomState>('room');
        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        const playerExists = stored.players.find(p => p.player_id === player_id);
        if (!playerExists) {
            return new Response('Player not in room', { status: 403 }); // 404でも良いかも
        }

        // 全プレイヤーのロールを更新
        stored.host = player_id;
        stored.players = stored.players.map(p => ({
            ...p,
            role: p.player_id === player_id ? 'gamemaster' : 'player',
        }));

        await storage.put('room', stored);

        return Response.json({ success: true, new_host: player_id });
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        if (e instanceof SyntaxError) {
            return new Response('Invalid JSON format', { status: 400 });
        }
        return new Response(`Error updating gamemaster: ${error}`, { status: 500 });
    }
}
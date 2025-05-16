// handlers/leaveHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState } from '../types';

export async function handleLeave(storage: DurableObjectStorage, request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { player_id } = (await request.json()) as { player_id?: string };
        if (!player_id) {
            return new Response('Missing player_id', { status: 400 });
        }

        const stored = await storage.get<RoomState>('room');
        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        const playerIndex = Array.isArray(stored.players)
            ? stored.players.findIndex(p => p.player_id === player_id)
            : -1;
        if (playerIndex === -1) {
            return new Response('Player not in room', { status: 404 });
        }

        // プレイヤーを削除
        if (Array.isArray(stored.players)) {
            stored.players.splice(playerIndex, 1);
        }

        // 退出したプレイヤーがホストだった場合
        if (stored.host_internal_id === player_id) {
            if (Array.isArray(stored.players) && stored.players.length > 0) {
                // 残っているプレイヤーの最初のプレイヤーを新しいホストにする
                const newHost = stored.players[0];
                stored.host_internal_id = newHost.player_id;
                // 新しいホストのロールを更新（他のプレイヤーのロールも必要に応じて更新）
                Object.values(stored.players).forEach(p => {
                    p.role = p.player_id === newHost.player_id ? 'gamemaster' : 'player';
                });
            } else {
                // 誰もいなくなった場合、ホストを空にする
                stored.host_internal_id = '';
                // 必要であればルームステータスも更新 (e.g., 'empty' or 'waiting')
            }
        }

        await storage.put('room', stored);

        return Response.json({ success: true, message: `Player ${player_id} left the room.` });
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        if (e instanceof SyntaxError) {
            return new Response('Invalid JSON format', { status: 400 });
        }
        return new Response(`Error leaving room: ${error}`, { status: 500 });
    }
}
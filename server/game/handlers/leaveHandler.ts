// handlers/leaveHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState } from '../types';
import { notifyRoomEvent } from '../roomObject';

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

        const playerIndex = stored.players.findIndex(p => p.player_id === player_id);
        if (playerIndex === -1) {
            return new Response('Player not in room', { status: 404 });
        }

        // プレイヤーを削除
        stored.players.splice(playerIndex, 1);

        // 退出したプレイヤーがホストだった場合
        if (stored.host === player_id) {
            if (stored.players.length > 0) {
                // 残っているプレイヤーの最初のプレイヤーを新しいホストにする
                const newHost = stored.players[0];
                stored.host = newHost.player_id;
                // 新しいホストのロールを更新（他のプレイヤーのロールも必要に応じて更新）
                stored.players = stored.players.map(p => ({
                    ...p,
                    role: p.player_id === newHost.player_id ? 'gamemaster' : 'player',
                }));
            } else {
                // 誰もいなくなった場合、ホストを空にする
                stored.host = '';
                // 必要であればルームステータスも更新 (e.g., 'empty' or 'waiting')
            }
        }

        await storage.put('room', stored);

        // 退出通知イベント
        await notifyRoomEvent(stored.code, 'room.player_left', `プレイヤーが退出しました: ${player_id}`);

        return Response.json({ success: true, message: `Player ${player_id} left the room.` });
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        if (e instanceof SyntaxError) {
            return new Response('Invalid JSON format', { status: 400 });
        }
        return new Response(`Error leaving room: ${error}`, { status: 500 });
    }
}
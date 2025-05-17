// handlers/joinHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState, Player } from '../types';
import { notifyRoomEvent } from '../roomObject';

export async function handleJoin(storage: DurableObjectStorage, request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { player_id, room_code } = await request.json() as { player_id?: string; room_code?: string };

        if (!player_id || !room_code) {
            return new Response('Missing player_id or room_code', { status: 400 });
        }

        const stored = await storage.get<RoomState>('room');
        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        if (stored.code !== room_code) {
            return new Response('Room code mismatch', { status: 400 });
        }

        if (stored.status !== 'waiting') {
            return new Response('Room is not open for joining', { status: 409 });
        }

        if (stored.players.some(player => player.player_id === player_id)) {
            return new Response('Player already joined', { status: 409 });
        }

        if (stored.players.length >= stored.maxPlayers) {
            return new Response('Room is full', { status: 409 });
        }

        const newPlayer: Player = {
            player_id,
            name: '', // 名前は後で設定するか、初期値を設定
            role: player_id === stored.host ? 'gamemaster' : 'player',
            score: 0
        };
        stored.players.push(newPlayer);

        await storage.put('room', stored);

        // ここで通知イベントを送信
        await notifyRoomEvent(room_code, 'room.player_joined', 'プレイヤーが参加しました');

        return Response.json({ success: true, player: newPlayer }); // 参加したプレイヤー情報を返すのも良い
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        if (e instanceof SyntaxError) { // JSON parse error
            return new Response('Invalid JSON format', { status: 400 });
        }
        return new Response(`Error joining room: ${error}`, { status: 500 });
    }
}
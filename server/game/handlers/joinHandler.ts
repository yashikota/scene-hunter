// handlers/joinHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState, Player } from '../types';

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

        if (stored.game_status !== 'waiting') {
            return new Response('Room is not open for joining', { status: 409 });
        }

        if (Array.isArray(stored.players) && stored.players.some(player => player.player_id === player_id)) {
            return new Response('Player already joined', { status: 409 });
        }

        if (!Array.isArray(stored.players)) {
            return new Response('Invalid room data', { status: 500 });
        }
        if (stored.players.length >= stored.max_players) {
            return new Response('Room is full', { status: 409 });
        }

        const newPlayer: Player = {
            player_id,
            name: '', // 名前は後で設定するか、初期値を設定
            role: player_id === stored.host_internal_id ? 'gamemaster' : 'player',
            points_current_round: 0,
            score_current_round_match: 0,
            total_points_all_rounds: 0,
            is_online: true
        };
        stored.players.push(newPlayer);

        await storage.put('room', stored);

        return Response.json({ success: true, player: newPlayer }); // 参加したプレイヤー情報を返すのも良い
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        if (e instanceof SyntaxError) { // JSON parse error
            return new Response('Invalid JSON format', { status: 400 });
        }
        return new Response(`Error joining room: ${error}`, { status: 500 });
    }
}
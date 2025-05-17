// handlers/settingsHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState } from '../types';

export async function handleSettings(storage: DurableObjectStorage, request: Request): Promise<Response> {
    if (request.method !== 'PUT') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        // 想定されるリクエストボディの型を定義
        const { rounds } = await request.json() as { rounds?: number };

        // rounds以外の設定項目も今後追加される可能性を考慮
        if (rounds === undefined) { // 他にも必須項目があれば追加
             return new Response('Missing settings data (e.g., rounds)', { status: 400 });
        }
        if (typeof rounds !== 'number' || rounds < 1) {
            return new Response('Invalid rounds value', { status: 400 });
        }


        const stored = await storage.get<RoomState>('room');
        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        // ゲーム開始後は設定変更不可などのロジック
        if (stored.status !== 'waiting') {
            return new Response('Room settings cannot be changed after game start or while in progress', { status: 403 });
        }

        stored.rounds = rounds;
        // 他の設定項目があればここで更新
        // stored.maxPlayers = maxPlayers; など

        await storage.put('room', stored);

        return Response.json({ success: true, settings: { rounds: stored.rounds }});
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        if (e instanceof SyntaxError) {
            return new Response('Invalid JSON format', { status: 400 });
        }
        return new Response(`Error updating settings: ${error}`, { status: 500 });
    }
}
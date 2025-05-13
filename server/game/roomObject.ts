import type { RoomState } from './types';
import type { DurableObjectState, DurableObjectStorage } from '@cloudflare/workers-types';

export class RoomObject {
  state: DurableObjectState;
  storage: DurableObjectStorage;
  room: RoomState | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/init' && request.method === 'POST') {
      const data = await request.json();
      this.room = data as RoomState;
      await this.storage.put('room', this.room);
      return new Response('Room initialized');
    }

    if (url.pathname === '/info') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
      }

      const stored = await this.storage.get<RoomState>('room');
      if (!stored) {
        return new Response('Room not found', { status: 404 });
      }

      // OpenAPI仕様に変換
      const result = {
        room_id: stored.id,
        room_code: stored.code,
        created_at: stored.createdAt,
        creator_id: stored.host,
        gamemaster_id: stored.host, // 仮にhost = gamemaster
        state: stored.status,
        players: stored.players.map((playerId) => ({
          player_id: playerId,
          name: '', // 名前は未管理 → 後で拡張
          role: playerId === stored.host ? 'gamemaster' : 'player',
          score: 0, // スコア管理は今後実装
        })),
        current_round: 0, // 仮置き
        total_rounds: stored.rounds,
      };

      return Response.json(result);
    }

    if (url.pathname === '/join' && request.method === 'POST') {
        const { player_id, room_code } = await request.json() as { player_id: string; room_code: string };
        const stored = await this.storage.get<RoomState>('room');
        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        if (stored.code !== room_code) {
            return new Response('Room code mismatch', { status: 400 });
        }

        if (stored.status !== 'waiting') {
            return new Response('Room is not open for joining', { status: 409 });
        }

        if (stored.players.includes(player_id)) {
            return new Response('Player already joined', { status: 409 });
        }

        if (stored.players.length >= stored.maxPlayers) {
            return new Response('Room is full', { status: 409 });
        }

        stored.players.push(player_id);

        // ここでストレージに保存
        await this.storage.put('room', stored);

        return Response.json({ success: true });
}

    return new Response('Not found', { status: 404 });
  }
}

import { Hono } from 'hono';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { validator } from 'hono/validator';
import type { RoomState } from '../types';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

const CreateRoomSchema = z.object({
  creator_id: z.string(),
  rounds: z.number().int().min(1),
});

app.post(
  '/rooms',
  validator('json', (value, c) => {
    const result = CreateRoomSchema.safeParse(value);
    if (!result.success) {
      return c.text('Invalid request', 400);
    }
    return result.data;
  }),
  async (c) => {
    const body = await c.req.json();
    console.log("ROOM CREATE BODY", body);
    const { creator_id, rounds } = c.req.valid('json');

    // 認証（仮実装: 本来はJWTなどから取得すべき）
    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return c.text('Unauthorized', 401);
    }
    const room_id = randomUUID();
    const room_code = generateRoomCode();
    const room: RoomState = {
      id: room_id,
      code: room_code,
      host: creator_id,
      players: [{ player_id: creator_id, name: 'Unknown', role: 'gamemaster', score: 0 }],
      status: 'waiting',
      createdAt: new Date().toISOString(),
      maxPlayers: 50,
      rounds,
      currentRound: 0,
    };

    const durableObjectId = c.env.ROOM_OBJECT.idFromName(room_id);
    const stub = c.env.ROOM_OBJECT.get(durableObjectId);
    await stub.fetch('http://internal/init', {
      method: 'POST',
      body: JSON.stringify(room),
    });

    return c.json(room);
  }
);

// 6桁のルームコード生成（例：312456）
function generateRoomCode(): string {
  const chars = '0123456789';
  return Array.from({ length: 6 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
}

export default app;
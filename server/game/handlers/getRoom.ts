// server/game/handlers/getRoom.ts

import { Hono } from 'hono';
import { isValidUUID } from '../utils/validateUUID';
import { DurableObjectNamespace } from '@cloudflare/workers-types';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

app.get('/rooms/:room_id', async (c) => {
  const roomId = c.req.param('room_id');
  const auth = c.req.header('Authorization');

  if (!auth || !auth.startsWith('Bearer ')) {
    return c.text('Unauthorized', 401);
  }

  if (!isValidUUID(roomId)) {
    return c.text('Invalid room_id', 400);
  }

  try {
    const durableObjectId = c.env.ROOM_OBJECT.idFromName(roomId); // ← 作成時と対応
    const stub = c.env.ROOM_OBJECT.get(durableObjectId);

    const response = await stub.fetch('http://internal/info');
    if (!response.ok) {
      return c.text('Room not found', 400);
    }

    const roomData = await response.json() as Record<string, unknown>;
    return c.json(roomData, 200);
  } catch (err) {
    console.error('Error fetching room:', err);
    return c.text('Internal Server Error', 500);
  }
});

export default app;

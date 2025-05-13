import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { z } from 'zod';
import { DurableObjectNamespace } from '@cloudflare/workers-types';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

const JoinRoomSchema = z.object({
  player_id: z.string(),
  room_code: z.string(),
});

app.post(
  '/rooms/:room_id/join',
  validator('json', (value, c) => {
    const result = JoinRoomSchema.safeParse(value);
    if (!result.success) {
      return c.text('Invalid request', 400);
    }
    return result.data;
  }),
  async (c) => {
    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return c.text('Unauthorized', 401);
    }

    const room_id = c.req.param('room_id');
    const { player_id, room_code } = c.req.valid('json');

    const durableId = c.env.ROOM_OBJECT.idFromName(room_id);
    const stub = c.env.ROOM_OBJECT.get(durableId);

    const res = await stub.fetch('http://internal/join', {
      method: 'POST',
      body: JSON.stringify({ player_id, room_code }),
    });

    if (res.status === 200) {
      return c.json({ success: true });
    }

    return new Response(await res.text(), { status: res.status });
  }
);

export default app;

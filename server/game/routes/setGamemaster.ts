import { Hono } from 'hono';
import { DurableObjectNamespace } from '@cloudflare/workers-types';
import { validator } from 'hono/validator';
import { z } from 'zod';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

const SetGamemasterSchema = z.object({
  player_id: z.string(),
});

app.put(
  '/rooms/:room_id/gamemaster',
  validator('json', (value, c) => {
    const result = SetGamemasterSchema.safeParse(value);
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
    const { player_id } = c.req.valid('json');

    const durableId = c.env.ROOM_OBJECT.idFromName(room_id);
    const stub = c.env.ROOM_OBJECT.get(durableId);

    const res = await stub.fetch('http://internal/gamemaster', {
      method: 'PUT',
      body: JSON.stringify({ player_id }),
    });

    if (res.status === 200) {
      return c.json({ success: true });
    }

    return new Response(await res.text(), { status: res.status });
  }
);

export default app;
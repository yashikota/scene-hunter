import { Hono } from 'hono';
import { DurableObjectNamespace } from '@cloudflare/workers-types';
import { validator } from 'hono/validator';
import { z } from 'zod';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

// POST /rooms/:room_id/rounds/:round_id/start
app.post(
  '/rooms/:room_id/rounds/:round_id/start',
  validator('json', (value, c) => {
    const schema = z.object({
      gamemaster_id: z.string(),
    });
    const result = schema.safeParse(value);
    if (!result.success) {
      return c.text('Invalid request body', 400);
    }
    return result.data;
  }),
  async (c) => {
    const { room_id, round_id } = c.req.param();
    const { gamemaster_id } = c.req.valid('json');

    // 認証（仮）
    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return c.text('Unauthorized', 401);
    }

    const id = c.env.ROOM_OBJECT.idFromName(room_id);
    const stub = c.env.ROOM_OBJECT.get(id);

    const res = await stub.fetch(`http://internal/rounds/${round_id}/start`, {
      method: 'POST',
      body: JSON.stringify({ gamemaster_id }),
    });

    const response = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
    });

    return response;
  }
);

export default app;

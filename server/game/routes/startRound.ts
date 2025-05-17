import { Hono } from 'hono';
import { DurableObjectNamespace } from '@cloudflare/workers-types';
import { validator } from 'hono/validator';
import { z } from 'zod';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

// POST /api/rooms/:room_id/start
app.post(
  '/rooms/:room_id/start',
  validator('json', (value, c) => {
    const schema = z.object({
      gamemaster_id: z.string(),
      photo_url: z.string().url(),
    });
    const result = schema.safeParse(value);
    if (!result.success) {
      return c.text('Invalid request body', 400);
    }
    return result.data;
  }),
  async (c) => {
    const { room_id } = c.req.param();
    const { gamemaster_id } = c.req.valid('json');

    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return c.text('Unauthorized', 401);
    }

    const id = c.env.ROOM_OBJECT.idFromName(room_id);
    const stub = c.env.ROOM_OBJECT.get(id);

    const res = await stub.fetch(`http://internal/rooms/${room_id}/start`, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ gamemaster_id }),
    });

    const body = await res.text();
    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: { 'Content-Type': 'application/json' },
    });
  }
);

export default app;
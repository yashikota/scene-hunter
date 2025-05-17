import { Hono } from 'hono';
import { DurableObjectNamespace } from '@cloudflare/workers-types';
import { validator } from 'hono/validator';
import { z } from 'zod';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

const SetPlayerNameSchema = z.object({
  name: z.string().min(1).max(12),
});

app.put(
  '/rooms/:room_id/players/:player_id',
  validator('json', (value, c) => {
    const result = SetPlayerNameSchema.safeParse(value);
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
    const { name } = c.req.valid('json');
    const { room_id, player_id } = c.req.param();
    if (auth.split(' ')[1] !== player_id) {
      return c.text('Forbidden', 403);
    }
    const durableId = c.env.ROOM_OBJECT.idFromName(room_id);
    const stub = c.env.ROOM_OBJECT.get(durableId);
    const res = await stub.fetch(`http://internal/players/${player_id}`, {
      method: 'PUT',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.status === 200) {
      const json = await res.json();
      return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(await res.text(), { status: res.status });
  }
);

export default app;
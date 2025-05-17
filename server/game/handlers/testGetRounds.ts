import { Hono } from 'hono';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

app.get('/rooms/:room_id/rounds', async (c) => {
  const { room_id } = c.req.param();

  const auth = c.req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.text('Unauthorized', 401);
  }

  const id = c.env.ROOM_OBJECT.idFromName(room_id);
  const stub = c.env.ROOM_OBJECT.get(id);

  const res = await stub.fetch('http://internal/rounds', { method: 'GET' });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: Object.fromEntries(res.headers)
  });
});

export default app;

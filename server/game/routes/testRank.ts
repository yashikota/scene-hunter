// server/routes/testRank.ts
import { Hono } from 'hono';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

app.post('/rooms/:room_id/test-rank', async (c) => {
  const room_id = c.req.param('room_id');
  const auth = c.req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.text('Unauthorized', 401);
  }

  const stub = c.env.ROOM_OBJECT.get(c.env.ROOM_OBJECT.idFromName(room_id));
  const res = await stub.fetch('http://internal/test-rank', { method: 'POST' });

  return new Response(await res.text(), { status: res.status });
});

export default app;

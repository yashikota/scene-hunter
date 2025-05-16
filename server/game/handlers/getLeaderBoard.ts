import { Hono } from 'hono';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

app.get('/rooms/:room_id/leaderboard', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.text('Unauthorized', 401);
  }

  const room_id = c.req.param('room_id');
  if (!room_id) {
    return c.text('Bad Request: room_id missing', 400);
  }

  const durableId = c.env.ROOM_OBJECT.idFromName(room_id);
  const stub = c.env.ROOM_OBJECT.get(durableId);

  const res = await stub.fetch('http://internal/leaderboard');
  if (res.status !== 200) {
    return new Response(await res.text(), { status: res.status });
  }

  return new Response(await res.text(), {
    headers: { 'Content-Type': 'application/json' },
  });
});

export default app;

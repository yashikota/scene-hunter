import { Hono } from 'hono';
import { validator } from 'hono/validator';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

app.get('/rooms/:room_id/rounds/:round_id', async (c) => {
  const { room_id, round_id } = c.req.param();

  // 認証（仮実装）
  const auth = c.req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.text('Unauthorized', 401);
  }

  const durableObjectId = c.env.ROOM_OBJECT.idFromName(room_id);
  const stub = c.env.ROOM_OBJECT.get(durableObjectId);

  const res = await stub.fetch(`http://internal/rounds/${round_id}`);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers.entries()),
  });
});

export default app;

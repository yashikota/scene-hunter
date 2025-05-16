import { Hono } from 'hono';
import { DurableObjectNamespace } from '@cloudflare/workers-types';
import { validator } from 'hono/validator';
import { z } from 'zod';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

const ParamSchema = z.object({
  room_id: z.string().uuid(),
  round_id: z.string().uuid(),
});

app.post(
  '/rooms/:room_id/rounds/:round_id/end',
  validator('param', (value, c) => {
    const result = ParamSchema.safeParse(value);
    if (!result.success) {
      return c.text('Invalid parameters', 400);
    }
    return result.data;
  }),
  async (c) => {
    const { room_id, round_id } = c.req.valid('param');

    // 認証チェック
    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return c.text('Unauthorized', 401);
    }

    const durableId = c.env.ROOM_OBJECT.idFromName(room_id);
    const stub = c.env.ROOM_OBJECT.get(durableId);

    const res = await stub.fetch(`http://internal/rounds/${round_id}/end`, {
      method: 'POST',
      headers: {
        Authorization: auth,
      },
    });

    const contentType = res.headers.get('Content-Type') || '';
    const isJson = contentType.includes('application/json');

    const response = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
    });

    return response;
  }
);

export default app;

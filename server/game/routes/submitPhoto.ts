import { Hono } from 'hono';
import { z } from 'zod';
import { validator } from 'hono/validator';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

// パスパラメータ検証
const ParamSchema = z.object({
  room_id: z.string().uuid(),
  round_id: z.string().uuid(),
});

// 本文検証
const BodySchema = z.object({
  player_id: z.string(),
  image_url: z.string().url(),
  remaining_seconds: z.number(),
});

app.post(
  '/rooms/:room_id/rounds/:round_id/photo',
  validator('param', (value, c) => {
    const result = ParamSchema.safeParse(value);
    if (!result.success) {
      return c.text('Invalid parameters', 400);
    }
    return result.data;
  }),
  validator('json', (value, c) => {
    const result = BodySchema.safeParse(value);
    if (!result.success) {
      return c.text('Invalid body', 400);
    }
    return result.data;
  }),
  async (c) => {
    const { room_id, round_id } = c.req.valid('param');
    const { player_id, image_url, remaining_seconds } = c.req.valid('json');

    // 認証チェック
    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return c.text('Unauthorized', 401);
    }

    // Durable Object へ渡す
    const durableId = c.env.ROOM_OBJECT.idFromName(room_id);
    const stub = c.env.ROOM_OBJECT.get(durableId);

    const res = await stub.fetch(`http://internal/rounds/${round_id}/photo`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ player_id, image_url: image_url, remaining_seconds }),
    });

    if (!res.ok) {
      return new Response(await res.text(), { status: res.status });
    }

    const contentTypeRes = res.headers.get('Content-Type') || '';
    const isJson = contentTypeRes.includes('application/json');
    return isJson ? c.json(await res.json() as Record<string, unknown>) : c.body(await res.text());
  }
);

export default app;
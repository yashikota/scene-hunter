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
  player_id: z.string().uuid(),
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
  async (c) => {
    const { room_id, round_id } = c.req.valid('param');

    // 認証チェック
    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return c.text('Unauthorized', 401);
    }

    // multipart/form-data を FormData で読み取り
    const contentType = c.req.header('Content-Type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return c.text('Content-Type must be multipart/form-data', 400);
    }

    const formData = await c.req.formData();

    const player_id = formData.get('player_id');
    const photoFile = formData.get('photo');

    if (typeof player_id !== 'string' || !(photoFile instanceof File)) {
      return c.text('Invalid form data', 400);
    }

    // Durable Object へ渡すために Cloudflare Workers の FormData を使用して再構築
    // @ts-ignore
    const cfForm = new (globalThis as any).FormData();
    cfForm.append('player_id', player_id);
    cfForm.append('photo', photoFile);

    const durableId = c.env.ROOM_OBJECT.idFromName(room_id);
    const stub = c.env.ROOM_OBJECT.get(durableId);

    const res = await stub.fetch(`http://internal/rounds/${round_id}/photo`, {
      method: 'POST',
      headers: {
        Authorization: auth,
      },
      body: cfForm,
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
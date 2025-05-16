import { Hono } from 'hono';
import { DurableObjectNamespace } from '@cloudflare/workers-types';
import { validator } from 'hono/validator';
import { z } from 'zod';

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

const UpdateSettingsSchema = z.object({
  rounds: z.number().int().min(1),
});

app.put(
  '/rooms/:room_id/settings',
  validator('json', (value, c) => {
    const result = UpdateSettingsSchema.safeParse(value);
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

    const room_id = c.req.param('room_id');
    const { rounds } = c.req.valid('json');

    const stub = c.env.ROOM_OBJECT.get(
      c.env.ROOM_OBJECT.idFromName(room_id)
    );

    const res = await stub.fetch('http://internal/settings', {
      method: 'PUT',
      body: JSON.stringify({ rounds }),
    });

    if (res.status === 200) {
      return c.json({ success: true });
    }

    return new Response(await res.text(), { status: res.status });
  }
);

export default app;
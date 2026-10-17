import * as v from 'valibot';
import { defineHandler } from 'void';
import { ai } from 'void/ai';
import { allow } from '../../../../src/server/limits';
import { bearer, errorResponse, limiter, roomDeps, tooMany } from '../../../../src/server/deps';
import { generateHints } from '../../../../src/server/hints';
import { parsePhotoKey } from '../../../../src/server/presign';
import { authorize, NotFoundError } from '../../../../src/server/services/rooms';

export const POST = defineHandler.withValidator({
  body: v.object({ key: v.string() }),
})(async (c, { body }) => {
  const code = c.req.param('code') ?? '';
  try {
    const d = await roomDeps(c);
    const { rec } = await authorize(d, bearer(c), 'gm', code);
    if (!(await allow(limiter(c, 'RL_HINTS'), code))) return tooMany(c);
    const parsed = parsePhotoKey(body.key);
    if (!parsed || parsed.code !== code || parsed.pid !== rec.gmPid) {
      return c.json({ error: 'bad_request', message: 'invalid photo key' }, 400);
    }
    const obj = await (c.env as { STORAGE: R2Bucket }).STORAGE.get(body.key);
    if (!obj) throw new NotFoundError('photo not found');
    const image = new Uint8Array(await obj.arrayBuffer());
    const qwen = ai.provider('qwen', {
      apiKeyEnv: 'QWEN_API_KEY',
      apiKeyHeader: 'Authorization',
      apiKeyPrefix: 'Bearer ',
    });
    const hints = await generateHints(
      {
        ai,
        qwen: async (b) => {
          const res = await qwen.fetch('/chat/completions', { body: b });
          if (!res.ok) throw new Error(`qwen api ${res.status}`);
          return res.json();
        },
      },
      image,
      rec.locale,
    );
    return { hints };
  } catch (e) {
    return errorResponse(c, e);
  }
});

import * as v from 'valibot';
import { defineHandler } from 'void';
import { allow } from '../../../../src/server/limits';
import { clientIp, errorResponse, limiter, roomDeps, tooMany } from '../../../../src/server/deps';
import { joinRoom } from '../../../../src/server/services/rooms';

export const POST = defineHandler.withValidator({
  body: v.object({ name: v.string(), pubkey: v.string() }),
})(async (c, { body }) => {
  if (!(await allow(limiter(c, 'RL_JOIN'), clientIp(c)))) return tooMany(c);
  try {
    const r = await joinRoom(await roomDeps(c), c.req.param('code') ?? '', body);
    if ('error' in r) return c.json(r, 404);
    return r;
  } catch (e) {
    return errorResponse(c, e);
  }
});

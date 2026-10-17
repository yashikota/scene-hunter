import * as v from 'valibot';
import { defineHandler } from 'void';
import { LOCALES } from '../../../src/shared/locales';
import { allow } from '../../../src/server/limits';
import { clientIp, errorResponse, limiter, roomDeps, tooMany } from '../../../src/server/deps';
import { createRoom } from '../../../src/server/services/rooms';

export const POST = defineHandler.withValidator({
  body: v.object({
    name: v.string(),
    pubkey: v.string(),
    locale: v.picklist(LOCALES),
    rounds: v.optional(v.number()),
    limitSec: v.optional(v.number()),
  }),
})(async (c, { body }) => {
  if (!(await allow(limiter(c, 'RL_CREATE'), clientIp(c)))) return tooMany(c);
  try {
    return await createRoom(await roomDeps(c), body);
  } catch (e) {
    return errorResponse(c, e);
  }
});

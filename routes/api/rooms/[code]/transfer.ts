import * as v from 'valibot';
import { defineHandler } from 'void';
import { bearer, errorResponse, roomDeps } from '../../../../src/server/deps';
import { transferGm } from '../../../../src/server/services/rooms';

export const POST = defineHandler.withValidator({
  body: v.object({ to: v.string() }),
})(async (c, { body }) => {
  try {
    return await transferGm(await roomDeps(c), bearer(c), body.to, c.req.param('code') ?? '');
  } catch (e) {
    return errorResponse(c, e);
  }
});

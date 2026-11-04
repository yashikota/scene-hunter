import * as v from "valibot";
import { defineHandler } from "void";
import { bearer, errorResponse, roomDeps } from "../../../../src/server/deps";
import { becomeAdmin } from "../../../../src/server/services/rooms";
export const POST = defineHandler.withValidator({
  body: v.object({ name: v.string(), pubkey: v.string() }),
})(async (c, { body }) => {
  try {
    return await becomeAdmin(await roomDeps(c), bearer(c), c.req.param("code") ?? "", body);
  } catch (e) {
    return errorResponse(c, e);
  }
});

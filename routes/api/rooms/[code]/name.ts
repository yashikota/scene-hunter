import * as v from "valibot";
import { defineHandler } from "void";
import { allow } from "../../../../src/server/limits";
import {
  bearer,
  clientIp,
  errorResponse,
  limiter,
  roomDeps,
  tooMany,
} from "../../../../src/server/deps";
import { renameMember } from "../../../../src/server/services/rooms";

/** ロビーで自分の名前を変える。新しい名前の参加証を返す。 */
export const POST = defineHandler.withValidator({
  body: v.object({ name: v.string(), pubkey: v.string() }),
})(async (c, { body }) => {
  if (!(await allow(limiter(c, "RL_JOIN"), clientIp(c)))) return tooMany(c);
  try {
    return await renameMember(await roomDeps(c), bearer(c), body, c.req.param("code") ?? "");
  } catch (e) {
    return errorResponse(c, e);
  }
});

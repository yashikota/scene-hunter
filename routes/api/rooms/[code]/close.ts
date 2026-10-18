import { defineHandler } from "void";
import { bearer, errorResponse, roomDeps } from "../../../../src/server/deps";
import { closeRoom } from "../../../../src/server/services/rooms";

export const POST = defineHandler(async (c) => {
  try {
    await closeRoom(await roomDeps(c), bearer(c), c.req.param("code") ?? "");
    return { ok: true };
  } catch (e) {
    return errorResponse(c, e);
  }
});

import * as v from "valibot";
import { defineHandler } from "void";
import { bearer, errorResponse, roomDeps } from "../../../../src/server/deps";
import { claimGm } from "../../../../src/server/services/rooms";

const transferSchema = v.object({
  body: v.object({
    room: v.string(),
    from: v.string(),
    to: v.string(),
    iat: v.number(),
    exp: v.number(),
  }),
  sig: v.string(),
});

export const POST = defineHandler.withValidator({
  body: v.object({ transfer: transferSchema, name: v.string(), pubkey: v.string() }),
})(async (c, { body }) => {
  try {
    return await claimGm(
      await roomDeps(c),
      bearer(c),
      body.transfer,
      { name: body.name, pubkey: body.pubkey },
      c.req.param("code") ?? "",
    );
  } catch (e) {
    return errorResponse(c, e);
  }
});

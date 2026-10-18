import * as v from "valibot";
import { defineHandler } from "void";
import { allow } from "../../../../src/server/limits";
import { bearer, errorResponse, limiter, photoDeps, tooMany } from "../../../../src/server/deps";
import { verifyRoomToken } from "../../../../src/server/hmac";
import { requestUpload } from "../../../../src/server/services/photos";

export const POST = defineHandler.withValidator({
  body: v.object({ gameId: v.string(), round: v.number(), size: v.number() }),
})(async (c, { body }) => {
  try {
    const d = photoDeps(c);
    const code = c.req.param("code") ?? "";
    // 回数制限は部屋とプレイヤーごと。トークンが不正なら制限を消費せずサービス側で 401 にする。
    const p = await verifyRoomToken(d.hmacSecret, bearer(c), Math.floor(d.now() / 1000));
    if (p && !(await allow(limiter(c, "RL_UPLOAD"), `${code}:${p.pid}`))) return tooMany(c);
    return await requestUpload(d, bearer(c), code, body);
  } catch (e) {
    return errorResponse(c, e);
  }
});

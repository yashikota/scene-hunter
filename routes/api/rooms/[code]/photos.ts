import { defineHandler } from "void";
import { bearer, errorResponse, photoDeps } from "../../../../src/server/deps";
import { listRoundPhotos } from "../../../../src/server/services/photos";

export const GET = defineHandler(async (c) => {
  try {
    const photos = await listRoundPhotos(photoDeps(c), bearer(c), c.req.param("code") ?? "", {
      gameId: c.req.query("gameId") ?? "",
      round: Number(c.req.query("round")),
    });
    return { photos };
  } catch (e) {
    return errorResponse(c, e);
  }
});

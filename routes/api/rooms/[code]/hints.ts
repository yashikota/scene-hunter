import * as v from "valibot";
import { defineHandler } from "void";
import { ai } from "void/ai";
import { allow } from "../../../../src/server/limits";
import {
  bearer,
  clientIp,
  e2eMode,
  errorResponse,
  limiter,
  roomDeps,
  tooMany,
} from "../../../../src/server/deps";
import { E2E_HINTS } from "../../../../src/server/e2e";
import { generateHints, HintGenerationError } from "../../../../src/server/hints";
import { MAX_PHOTO_BYTES, parsePhotoKey } from "../../../../src/server/presign";
import { authorize, NotFoundError } from "../../../../src/server/services/rooms";

export const POST = defineHandler.withValidator({
  body: v.object({ key: v.string() }),
})(async (c, { body }) => {
  const code = c.req.param("code") ?? "";
  try {
    const d = await roomDeps(c);
    const { rec } = await authorize(d, bearer(c), "gm", code);
    // AI は高いので、部屋ごとに加えて IP ごとにも数える（部屋を次々に作ってヒントを呼ぶのを抑える）。
    const rl = limiter(c, "RL_HINTS");
    if (!(await allow(rl, code)) || !(await allow(rl, `ip:${clientIp(c)}`))) return tooMany(c);
    const parsed = parsePhotoKey(body.key);
    if (!parsed || parsed.code !== code || parsed.pid !== rec.gmPid) {
      return c.json({ error: "bad_request", message: "invalid photo key" }, 400);
    }
    const obj = await (c.env as { STORAGE: R2Bucket }).STORAGE.get(body.key);
    if (!obj) throw new NotFoundError("photo not found");
    if (obj.size > MAX_PHOTO_BYTES) return c.json({ error: "payload_too_large" }, 413);
    const image = new Uint8Array(await obj.arrayBuffer());
    // e2e テストでは AI を呼ばない（写真の確かめまでは本番と同じ道を通す）。
    if (e2eMode(c)) return { hints: [...E2E_HINTS] };
    const qwen = ai.provider("qwen", {
      apiKeyEnv: "QWEN_API_KEY",
      apiKeyHeader: "Authorization",
      apiKeyPrefix: "Bearer ",
    });
    const hints = await generateHints(
      {
        ai,
        qwen: async (b) => {
          const res = await qwen.fetch("/chat/completions", { body: b });
          if (!res.ok) throw new Error(`qwen api ${res.status}`);
          return res.json();
        },
      },
      image,
      rec.locale,
    );
    return { hints };
  } catch (e) {
    if (e instanceof HintGenerationError) return c.json({ error: "hint_generation_failed" }, 502);
    return errorResponse(c, e);
  }
});

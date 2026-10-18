// e2e テスト専用の写真の置き場（R2 の署名付き URL の代わり。src/server/e2e.ts）。
// .dev なので本番のビルドには入らない。さらに e2e のモード（SH_E2E=1 かつ localhost）でなければ 404 を返す。
import { defineHandler } from "void";
import { env } from "void/env";
import { e2eMode } from "../../../src/server/deps";
import { checkBlobPut, verifyBlobUrl } from "../../../src/server/e2e";

type Ctx = Parameters<typeof e2eMode>[0];

const notFound = (c: Ctx) => c.json({ error: "not_found" }, 404);
const forbidden = (c: Ctx) => c.json({ error: "forbidden" }, 403);
const storage = (c: Ctx) => (c.env as { STORAGE: R2Bucket }).STORAGE;
const nowSec = () => Math.floor(Date.now() / 1000);

export const PUT = defineHandler(async (c) => {
  if (!e2eMode(c) || !env.HMAC_SECRET) return notFound(c);
  const claim = await verifyBlobUrl(env.HMAC_SECRET, new URL(c.req.url), "PUT", nowSec());
  if (!claim) return forbidden(c);
  const body = new Uint8Array(await c.req.arrayBuffer());
  const declared = Number(c.req.header("content-length") ?? body.byteLength);
  if (declared !== claim.size || !checkBlobPut(claim, c.req.header("content-type"), body)) {
    return forbidden(c);
  }
  await storage(c).put(claim.key, body, { httpMetadata: { contentType: "image/jpeg" } });
  return c.body(null, 200);
});

export const GET = defineHandler(async (c) => {
  if (!e2eMode(c) || !env.HMAC_SECRET) return notFound(c);
  const claim = await verifyBlobUrl(env.HMAC_SECRET, new URL(c.req.url), "GET", nowSec());
  if (!claim) return forbidden(c);
  const obj = await storage(c).get(claim.key);
  if (!obj) return notFound(c);
  return new Response(await obj.arrayBuffer(), { headers: { "content-type": "image/jpeg" } });
});

import type { CloudContext as Context } from "void";
import { env } from "void/env";
import { importPrivateKey } from "../shared/crypto";
import { createRelayApi } from "./relay";
import { createRoomStore, randomRoomCode } from "./roomStore";
import { createPresigner } from "./presign";
import type { PhotoDeps } from "./services/photos";
import type { RoomDeps } from "./services/rooms";
import { AuthError, NotFoundError } from "./services/rooms";
import type { Limiter } from "./limits";
import {
  createE2ePresigner,
  createE2eRelay,
  createMemoryLimiter,
  E2E_LIMITS,
  E2E_RELAY_URL,
  isE2e,
} from "./e2e";

function secret(name: string, v: string | undefined): string {
  if (!v) throw new Error(`missing secret ${name}`);
  return v;
}

/**
 * e2e テストのモードか（SH_E2E=1 の void dev に localhost から来たときだけ。src/server/e2e.ts）。
 * 本番では SH_E2E を設定しないので常に false。
 */
export function e2eMode(c: Context): boolean {
  return isE2e(env.SH_E2E, c.req.url);
}

export async function roomDeps(c: Context): Promise<RoomDeps> {
  // void/kv は JSON を自動で変換するクライアントなので、roomStore には素の binding を渡す。
  const bindings = c.env as { KV: KVNamespace; STORAGE: R2Bucket };
  const e2e = e2eMode(c) ? createE2eRelay(env.SH_E2E_RELAY_URL ?? E2E_RELAY_URL) : null;
  return {
    relay:
      e2e?.relay ??
      createRelayApi({
        accountId: secret("CF_ACCOUNT_ID", env.CF_ACCOUNT_ID),
        apiToken: secret("CF_API_TOKEN", env.CF_API_TOKEN),
      }),
    ...(e2e ? { moqUrl: e2e.moqUrl } : {}),
    store: createRoomStore(bindings.KV),
    storage: bindings.STORAGE,
    hmacSecret: secret("HMAC_SECRET", env.HMAC_SECRET),
    serverKey: await importPrivateKey(secret("SERVER_SIGNING_KEY", env.SERVER_SIGNING_KEY)),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    randomCode: () => randomRoomCode(),
  };
}

export function photoDeps(c: Context): PhotoDeps {
  const bindings = c.env as { KV: KVNamespace; STORAGE: R2Bucket };
  return {
    presigner: e2eMode(c)
      ? createE2ePresigner({
          origin: new URL(c.req.url).origin,
          secret: secret("HMAC_SECRET", env.HMAC_SECRET),
          now: () => Date.now(),
        })
      : createPresigner({
          accountId: secret("CF_ACCOUNT_ID", env.CF_ACCOUNT_ID),
          bucket: secret("R2_BUCKET", env.R2_BUCKET),
          accessKeyId: secret("R2_ACCESS_KEY_ID", env.R2_ACCESS_KEY_ID),
          secretAccessKey: secret("R2_SECRET_ACCESS_KEY", env.R2_SECRET_ACCESS_KEY),
        }),
    storage: bindings.STORAGE,
    store: createRoomStore(bindings.KV),
    hmacSecret: secret("HMAC_SECRET", env.HMAC_SECRET),
    now: () => Date.now(),
    rand: () =>
      [...crypto.getRandomValues(new Uint8Array(8))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
  };
}

export type LimiterName = "RL_CREATE" | "RL_JOIN" | "RL_HINTS" | "RL_UPLOAD";

/** e2e の回数制限（上限だけ上げたもの）。isolate の中で名前ごとに 1 つ。 */
const e2eLimiters = new Map<LimiterName, Limiter>();

export function limiter(c: Context, name: LimiterName): Limiter {
  if (e2eMode(c)) {
    let l = e2eLimiters.get(name);
    if (!l) e2eLimiters.set(name, (l = createMemoryLimiter(E2E_LIMITS[name])));
    return l;
  }
  return (c.env as Record<string, Limiter>)[name];
}

export function clientIp(c: Context): string {
  return c.req.header("cf-connecting-ip") ?? "unknown";
}

export function bearer(c: Context): string {
  const h = c.req.header("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

/** サービスの例外を HTTP の状態に直す。想定外の例外はそのまま投げる。 */
export function errorResponse(c: Context, e: unknown): Response {
  if (e instanceof RangeError) return c.json({ error: "bad_request", message: e.message }, 400);
  if (e instanceof AuthError) return c.json({ error: "unauthorized" }, 401);
  if (e instanceof NotFoundError) return c.json({ error: "not_found" }, 404);
  throw e;
}

export function tooMany(c: Context): Response {
  return c.json({ error: "rate_limited" }, 429);
}

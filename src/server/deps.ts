import type { CloudContext as Context } from 'void';
import { env } from 'void/env';
import { importPrivateKey } from '../shared/crypto';
import { createRelayApi } from './relay';
import { createRoomStore, randomRoomCode } from './roomStore';
import type { RoomDeps } from './services/rooms';
import { AuthError, NotFoundError } from './services/rooms';
import type { Limiter } from './limits';

function secret(name: string, v: string | undefined): string {
  if (!v) throw new Error(`missing secret ${name}`);
  return v;
}

export async function roomDeps(c: Context): Promise<RoomDeps> {
  // void/kv は JSON を自動で変換するクライアントなので、roomStore には素の binding を渡す。
  const bindings = c.env as { KV: KVNamespace; STORAGE: R2Bucket };
  return {
    relay: createRelayApi({
      accountId: secret('CF_ACCOUNT_ID', env.CF_ACCOUNT_ID),
      apiToken: secret('CF_API_TOKEN', env.CF_API_TOKEN),
    }),
    store: createRoomStore(bindings.KV),
    storage: bindings.STORAGE,
    hmacSecret: secret('HMAC_SECRET', env.HMAC_SECRET),
    serverKey: await importPrivateKey(secret('SERVER_SIGNING_KEY', env.SERVER_SIGNING_KEY)),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    randomCode: () => randomRoomCode(),
  };
}

export type LimiterName = 'RL_CREATE' | 'RL_JOIN' | 'RL_HINTS' | 'RL_UPLOAD';

export function limiter(c: Context, name: LimiterName): Limiter {
  return (c.env as Record<string, Limiter>)[name];
}

export function clientIp(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? 'unknown';
}

export function bearer(c: Context): string {
  const h = c.req.header('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

/** サービスの例外を HTTP の状態に直す。想定外の例外はそのまま投げる。 */
export function errorResponse(c: Context, e: unknown): Response {
  if (e instanceof RangeError) return c.json({ error: 'bad_request', message: e.message }, 400);
  if (e instanceof AuthError) return c.json({ error: 'unauthorized' }, 401);
  if (e instanceof NotFoundError) return c.json({ error: 'not_found' }, 404);
  throw e;
}

export function tooMany(c: Context): Response {
  return c.json({ error: 'rate_limited' }, 429);
}

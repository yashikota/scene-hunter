/**
 * e2e テスト（tests/e2e、Playwright）のときだけ使う、Cloudflare 専用の依存の代わり。
 *
 * SH_E2E=1 で起動した void dev に localhost からリクエストが来たときだけ有効にする（isE2e）。
 * 本番では SH_E2E を設定しないので、ここにあるものは使われない。
 * - Relay：Cloudflare の MoQ API の代わりに、手元の moq-relay（scripts/e2e-relay.sh）のパスを部屋ごとに配る。
 * - 写真：R2 の署名付き URL の代わりに、/api/e2e/blob への署名付き URL を出す（中身は void dev の R2 の模擬に置く）。
 * - ヒント：AI を呼ばず、決まった 5 つを返す。
 * - 回数制限：数え方は同じで上限だけ上げる（localhost では全員が同じ IP になるため）。
 */
import type { Presigner } from './presign';
import { MAX_PHOTO_BYTES } from './presign';
import type { Limiter } from './limits';
import type { RelayApi } from './relay';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** e2e の切り替え。SH_E2E が '1' で、かつリクエストの宛先が手元（localhost）のときだけ true。 */
export function isE2e(flag: string | undefined, requestUrl: string): boolean {
  if (flag !== '1') return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(requestUrl).hostname);
  } catch {
    return false;
  }
}

export const E2E_RELAY_URL = 'http://localhost:4443/';

const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

/** 手元の moq-relay を使う RelayApi。部屋ごとに乱数のパスを配り、そのパスを moqUrl にする。 */
export function createE2eRelay(base = E2E_RELAY_URL): {
  relay: RelayApi;
  moqUrl(token: string): string;
} {
  const root = base.endsWith('/') ? base : `${base}/`;
  return {
    relay: {
      create: async () => ({ uid: `e2e-${randomHex(8)}`, token: `e2e-${randomHex(16)}` }),
      delete: async () => {},
      list: async () => [],
    },
    moqUrl: (token) => `${root}${token}`,
  };
}

/** e2e のヒント。AI を呼ばずにすぐ返す。 */
export const E2E_HINTS = [
  'e2e hint 1: something in the room',
  'e2e hint 2: it has a color',
  'e2e hint 3: it is near the camera',
  'e2e hint 4: it is in the middle of the frame',
  'e2e hint 5: the fake camera test pattern',
] as const;

const PUT_EXPIRES_SEC = 300;
const GET_EXPIRES_SEC = 3600;
export const E2E_BLOB_PATH = '/api/e2e/blob';

const encoder = new TextEncoder();

function hmacKey(secret: string): Promise<CryptoKey> {
  // 部屋のトークンと同じ秘密から、用途を変えた鍵を作る（署名の取り違えを防ぐ）。
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(`e2e-blob:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

type BlobClaim = { method: 'PUT' | 'GET'; key: string; size: number; exp: number };

const claimText = (c: BlobClaim) => `${c.method}\n${c.key}\n${c.size}\n${c.exp}`;

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** R2 の署名付き URL の代わり。PUT は content-type と大きさを、GET はキーだけを署名する。 */
export function createE2ePresigner(o: {
  origin: string;
  secret: string;
  now: () => number;
}): Presigner {
  async function sign(c: BlobClaim): Promise<string> {
    const sig = hex(
      await crypto.subtle.sign('HMAC', await hmacKey(o.secret), encoder.encode(claimText(c))),
    );
    const url = new URL(E2E_BLOB_PATH, o.origin);
    url.searchParams.set('m', c.method);
    url.searchParams.set('key', c.key);
    url.searchParams.set('size', String(c.size));
    url.searchParams.set('exp', String(c.exp));
    url.searchParams.set('sig', sig);
    return url.toString();
  }
  const nowSec = () => Math.floor(o.now() / 1000);
  return {
    put: (key, size) => sign({ method: 'PUT', key, size, exp: nowSec() + PUT_EXPIRES_SEC }),
    get: (key) => sign({ method: 'GET', key, size: 0, exp: nowSec() + GET_EXPIRES_SEC }),
  };
}

/** 署名付き URL を確かめ、通れば中身（メソッド、キー、大きさ）を返す。不正なら null。 */
export async function verifyBlobUrl(
  secret: string,
  url: URL,
  method: 'PUT' | 'GET',
  nowSec: number,
): Promise<BlobClaim | null> {
  const q = url.searchParams;
  const key = q.get('key') ?? '';
  const size = Number(q.get('size'));
  const exp = Number(q.get('exp'));
  const sig = q.get('sig') ?? '';
  if (q.get('m') !== method || !key || !Number.isInteger(size) || !Number.isInteger(exp)) {
    return null;
  }
  if (!/^[0-9a-f]{64}$/.test(sig) || nowSec >= exp) return null;
  const claim: BlobClaim = { method, key, size, exp };
  const sigBytes = new Uint8Array(sig.match(/../g)!.map((h) => parseInt(h, 16)));
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    sigBytes,
    encoder.encode(claimText(claim)),
  );
  return ok ? claim : null;
}

/** PUT の中身が、署名した content-type と大きさに合うか（R2 が署名付き URL で確かめるのと同じ）。 */
export function checkBlobPut(
  claim: BlobClaim,
  contentType: string | undefined,
  body: Uint8Array,
): boolean {
  return (
    contentType === 'image/jpeg' &&
    claim.size > 0 &&
    claim.size <= MAX_PHOTO_BYTES &&
    body.byteLength === claim.size
  );
}

/**
 * e2e の回数制限の上限（60 秒あたり）。本番（void.config.ts）は CREATE 2、JOIN 10、HINTS 3、UPLOAD 5。
 * localhost では全員が同じ IP（cf-connecting-ip なし）なので、本番の上限のままではテストの途中で 429 になる。
 */
export const E2E_LIMITS = { RL_CREATE: 60, RL_JOIN: 300, RL_HINTS: 60, RL_UPLOAD: 60 } as const;

const WINDOW_MS = 60_000;

/** Rate Limiting binding と同じ形の、メモリ上の固定窓の数え方。 */
export function createMemoryLimiter(limit: number, now: () => number = Date.now): Limiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    limit: async ({ key }) => {
      const t = now();
      let w = windows.get(key);
      if (!w || t - w.start >= WINDOW_MS) {
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      w.count++;
      return { success: w.count <= limit };
    },
  };
}

import { fetch } from 'void/client';
import type { Cert, TransferCert } from '../shared/cert';
import type { Locale } from '../shared/locales';

export interface Joined {
  code: string;
  pid: string;
  roomToken: string;
  cert: Cert;
  moqUrl: string;
  locale: Locale;
  rounds: number;
  limitSec: number;
}

export interface RoundPhoto {
  pid: string;
  key: string;
  url: string;
}

export type HintsResult =
  | { ok: true; hints: string[] }
  | { ok: false; reason: 'failed' | 'too_large' | 'rate_limited' };

const JOIN_RETRY_MS = 3000;
const JOIN_TIMEOUT_MS = 60_000;
/**
 * 部屋があるかの確かめで、{ exists: false } を待ち直す回数と間隔。打ち間違いはすぐ知らせたいので短くし、
 * できた直後の部屋が KV に見えるまでの数秒だけを待つ（合わせて 3 回、約 6 秒）。
 */
const CHECK_RETRIES = 2;
const CHECK_RETRY_MS = 3000;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const statusOf = (e: unknown): number | undefined =>
  e instanceof Error ? (e as { status?: number }).status : undefined;
const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createRoom(input: {
  name: string;
  pubkey: string;
  locale: Locale;
  rounds?: number;
  limitSec?: number;
}): Promise<Joined> {
  return fetch('/api/rooms', { method: 'POST', body: input, retry: 0 }) as Promise<Joined>;
}

/**
 * 部屋に入る。部屋がまだ見えない間（404）は 3 秒おきに 60 秒まで待ち直し、その都度 onWaiting を呼ぶ。
 * 404 以外の失敗はすぐ投げる。
 */
export async function joinRoom(
  code: string,
  input: { name: string; pubkey: string },
  opts: { onWaiting?: () => void; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Joined> {
  const sleep = opts.sleep ?? sleepMs;
  for (let waited = 0; ; waited += JOIN_RETRY_MS) {
    try {
      return (await fetch('/api/rooms/:code/join', {
        method: 'POST',
        params: { code },
        body: input,
        retry: 0,
      })) as Joined;
    } catch (e) {
      if (statusOf(e) !== 404 || waited >= JOIN_TIMEOUT_MS) throw e;
      opts.onWaiting?.();
      await sleep(JOIN_RETRY_MS);
    }
  }
}

/** 404 として扱う失敗（部屋が無い）。画面の文言は状態で選ぶ。 */
const notFound = () => Object.assign(new Error('room not found'), { status: 404 });

/**
 * 部屋があるか確かめる。{ exists: false } なら 3 秒おきに 2 回まで確かめ直し、それでも無ければ
 * status 404 の Error を投げる。JSON の { exists: true } 以外（SPA の HTML など）は、あるとみなさず失敗にする。
 */
export async function checkRoom(
  code: string,
  opts: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const sleep = opts.sleep ?? sleepMs;
  for (let retry = 0; ; retry++) {
    const res = (await fetch('/api/rooms/:code', { params: { code }, retry: 0 })) as unknown;
    const exists =
      typeof res === 'object' && res !== null ? (res as { exists?: unknown }).exists : undefined;
    if (exists === true) return;
    if (exists !== false) throw new Error('unexpected response from room check');
    if (retry >= CHECK_RETRIES) throw notFound();
    await sleep(CHECK_RETRY_MS);
  }
}

export function requestUpload(
  code: string,
  token: string,
  input: { gameId: string; round: number; size: number },
): Promise<{ key: string; url: string }> {
  return fetch('/api/rooms/:code/uploads', {
    method: 'POST',
    params: { code },
    headers: auth(token),
    body: input,
    retry: 0,
  });
}

export async function listPhotos(
  code: string,
  token: string,
  query: { gameId: string; round: number },
): Promise<RoundPhoto[]> {
  const res = (await fetch('/api/rooms/:code/photos', {
    params: { code },
    headers: auth(token),
    query: { gameId: query.gameId, round: String(query.round) },
    retry: 0,
  })) as { photos?: unknown } | null;
  // 本番では GET の 404 が SPA の HTML（200）に差し替わる。形が違う応答は失敗として扱い、呼び出し側にやり直させる
  if (!Array.isArray(res?.photos)) throw new Error('unexpected response from photo list');
  return res.photos as RoundPhoto[];
}

export async function requestHints(code: string, token: string, key: string): Promise<HintsResult> {
  try {
    const res = (await fetch('/api/rooms/:code/hints', {
      method: 'POST',
      params: { code },
      headers: auth(token),
      body: { key },
      retry: 0,
    })) as { hints: string[] };
    return { ok: true, hints: res.hints };
  } catch (e) {
    const status = statusOf(e);
    // 通信そのものの失敗（状態なし）も、やり直せる失敗として扱う。
    if (status === undefined) return { ok: false, reason: 'failed' };
    if (status === 413) return { ok: false, reason: 'too_large' };
    if (status === 429) return { ok: false, reason: 'rate_limited' };
    if (status === 502) return { ok: false, reason: 'failed' };
    throw e;
  }
}

export function transfer(code: string, token: string, toPid: string): Promise<TransferCert> {
  return fetch('/api/rooms/:code/transfer', {
    method: 'POST',
    params: { code },
    headers: auth(token),
    body: { to: toPid },
    retry: 0,
  }) as Promise<TransferCert>;
}

export function claim(
  code: string,
  token: string,
  input: { transfer: TransferCert; pubkey: string; name: string },
): Promise<{ roomToken: string; cert: Cert }> {
  return fetch('/api/rooms/:code/claim', {
    method: 'POST',
    params: { code },
    headers: auth(token),
    body: input,
    retry: 0,
  }) as Promise<{ roomToken: string; cert: Cert }>;
}

export async function closeRoom(code: string, token: string): Promise<void> {
  await fetch('/api/rooms/:code/close', {
    method: 'POST',
    params: { code },
    headers: auth(token),
    retry: 0,
  });
}

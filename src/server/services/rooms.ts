import { issueCert, issueTransfer, verifyTransfer } from '../../shared/cert';
import type { Cert, Role, TransferCert } from '../../shared/cert';
import { importPublicKey } from '../../shared/crypto';
import type { Locale } from '../../shared/locales';
import { issueRoomToken, verifyRoomToken } from '../hmac';
import type { RoomTokenPayload } from '../hmac';
import { moqUrl } from '../relay';
import type { RelayApi } from '../relay';
import type { createRoomStore, RoomRecord } from '../roomStore';

export interface RoomDeps {
  relay: RelayApi;
  store: ReturnType<typeof createRoomStore>;
  storage: Pick<R2Bucket, 'list' | 'delete'>;
  hmacSecret: string;
  serverKey: CryptoKey;
  /** 現在時刻（ミリ秒）。 */
  now: () => number;
  newId: () => string;
  randomCode: () => string;
}

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

/** トークンが不正、または役割が足りない。 */
export class AuthError extends Error {}
/** 部屋が存在しない（解散済みや期限切れ）。 */
export class NotFoundError extends Error {}

const TOKEN_LIFETIME_SEC = 43200;
const MAX_CREATE_ATTEMPTS = 3;
const DEFAULT_ROUNDS = 3;
const DEFAULT_LIMIT_SEC = 60;

function checkName(raw: string): string {
  const name = raw.trim();
  const len = [...name].length;
  if (len < 1 || len > 12) throw new RangeError('name must be 1-12 characters');
  return name;
}

async function checkPubkey(pubkey: string): Promise<void> {
  try {
    await importPublicKey(pubkey);
  } catch {
    throw new RangeError('invalid pubkey');
  }
}

function checkInt(v: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(v) || v < min || v > max) {
    throw new RangeError(`${label} must be an integer in ${min}-${max}`);
  }
  return v;
}

async function issueMember(
  d: RoomDeps,
  p: { room: string; pid: string; name: string; role: Role; pubkey: string },
): Promise<{ roomToken: string; cert: Cert }> {
  const iat = Math.floor(d.now() / 1000);
  const exp = iat + TOKEN_LIFETIME_SEC;
  const roomToken = await issueRoomToken(d.hmacSecret, {
    room: p.room,
    role: p.role,
    pid: p.pid,
    exp,
  });
  const cert = await issueCert(d.serverKey, { ...p, iat, exp });
  return { roomToken, cert };
}

const ROOM_CODE = /^\d{6}$/;

export function checkCode(code: string): void {
  if (!ROOM_CODE.test(code)) throw new NotFoundError('room not found');
}

/** トークンを検証し、部屋の記録を返す。GM の操作では、いまの GM 本人であることも確かめる。 */
export async function authorize(
  d: Pick<RoomDeps, 'store' | 'hmacSecret' | 'now'>,
  token: string,
  role: Role | 'any',
  code: string,
): Promise<{ payload: RoomTokenPayload; rec: RoomRecord }> {
  checkCode(code);
  const payload = await verifyRoomToken(d.hmacSecret, token, Math.floor(d.now() / 1000));
  if (!payload) throw new AuthError('invalid token');
  if (role !== 'any' && payload.role !== role) throw new AuthError(`${role} token required`);
  if (payload.room !== code) throw new AuthError('token is for another room');
  const rec = await d.store.get(code);
  if (!rec) throw new NotFoundError('room not found');
  if (payload.role === 'gm' && payload.pid !== rec.gmPid) throw new AuthError('no longer the GM');
  return { payload, rec };
}

/** 作り直しの後始末。失敗しても元の例外を隠さない（cron が後で拾う）。 */
async function discardRelay(d: RoomDeps, uid: string): Promise<void> {
  try {
    await d.relay.delete(uid);
  } catch (e) {
    console.error('failed to delete relay', uid, e);
  }
}

export async function createRoom(
  d: RoomDeps,
  input: { name: string; pubkey: string; locale: Locale; rounds?: number; limitSec?: number },
): Promise<Joined> {
  const name = checkName(input.name);
  const rounds = checkInt(input.rounds ?? DEFAULT_ROUNDS, 1, 10, 'rounds');
  const limitSec = checkInt(input.limitSec ?? DEFAULT_LIMIT_SEC, 30, 120, 'limitSec');
  await checkPubkey(input.pubkey);

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const code = d.randomCode();
    const relay = await d.relay.create(`sh-${code}`);
    const pid = d.newId();
    let stored = false;
    try {
      stored = await d.store.put({
        code,
        relayUid: relay.uid,
        moqToken: relay.token,
        locale: input.locale,
        rounds,
        limitSec,
        createdAt: d.now(),
        gmPid: pid,
        gmSince: Math.floor(d.now() / 1000),
      });
    } finally {
      if (!stored) await discardRelay(d, relay.uid);
    }
    if (!stored) continue;

    const { roomToken, cert } = await issueMember(d, {
      room: code,
      pid,
      name,
      role: 'gm',
      pubkey: input.pubkey,
    });
    return {
      code,
      pid,
      roomToken,
      cert,
      moqUrl: moqUrl(relay.token),
      locale: input.locale,
      rounds,
      limitSec,
    };
  }
  throw new Error('could not allocate a room code');
}

export async function joinRoom(
  d: RoomDeps,
  code: string,
  input: { name: string; pubkey: string },
): Promise<Joined | { error: 'not_found' }> {
  if (!ROOM_CODE.test(code)) return { error: 'not_found' };
  const name = checkName(input.name);
  await checkPubkey(input.pubkey);
  const rec = await d.store.get(code);
  if (!rec) return { error: 'not_found' };

  const pid = d.newId();
  const { roomToken, cert } = await issueMember(d, {
    room: code,
    pid,
    name,
    role: 'player',
    pubkey: input.pubkey,
  });
  return {
    code,
    pid,
    roomToken,
    cert,
    moqUrl: moqUrl(rec.moqToken),
    locale: rec.locale,
    rounds: rec.rounds,
    limitSec: rec.limitSec,
  };
}

export async function transferGm(
  d: RoomDeps,
  token: string,
  toPid: string,
  code: string,
): Promise<TransferCert> {
  const { payload: p } = await authorize(d, token, 'gm', code);
  if (toPid === p.pid) throw new RangeError('cannot transfer to self');
  const iat = Math.floor(d.now() / 1000);
  return issueTransfer(d.serverKey, {
    room: p.room,
    from: p.pid,
    to: toPid,
    iat,
    exp: iat + TOKEN_LIFETIME_SEC,
  });
}

/** 秘密鍵（extractable）から対応する公開鍵（raw の base64url）を取り出す。 */
async function serverPublicKey(priv: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', priv);
  if (!jwk.x) throw new Error('server key has no public part');
  return jwk.x;
}

export async function claimGm(
  d: RoomDeps,
  token: string,
  transfer: TransferCert,
  input: { name: string; pubkey: string },
  code: string,
): Promise<{ roomToken: string; cert: Cert }> {
  const { payload: p, rec } = await authorize(d, token, 'player', code);
  const nowSec = Math.floor(d.now() / 1000);
  if (!(await verifyTransfer(await serverPublicKey(d.serverKey), transfer, p.room, nowSec))) {
    throw new AuthError('invalid transfer');
  }
  if (transfer.body.to !== p.pid) throw new AuthError('transfer is for another player');
  // 古い交代証や使用済みの交代証で GM を奪えないよう、いまの GM 発行で、現 GM の就任後のものに限る。
  if (transfer.body.from !== rec.gmPid || transfer.body.iat < rec.gmSince) {
    throw new AuthError('stale transfer');
  }
  const name = checkName(input.name);
  await checkPubkey(input.pubkey);
  if (!(await d.store.put({ ...rec, gmPid: p.pid, gmSince: nowSec + 1 }))) {
    throw new Error('could not record the new GM');
  }
  return issueMember(d, { room: p.room, pid: p.pid, name, role: 'gm', pubkey: input.pubkey });
}

export async function closeRoom(d: RoomDeps, token: string, code: string): Promise<void> {
  const { payload: p, rec } = await authorize(d, token, 'gm', code);

  await d.relay.delete(rec.relayUid);
  const prefix = `rooms/${p.room}/`;
  let cursor: string | undefined;
  do {
    const page = await d.storage.list({ prefix, cursor });
    if (page.objects.length > 0) await d.storage.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  await d.store.delete(p.room);
}

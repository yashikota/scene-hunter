import { sign, verify } from './crypto';

export type Role = 'gm' | 'player';

export interface CertBody {
  room: string;
  pid: string;
  name: string;
  role: Role;
  pubkey: string;
  iat: number;
  exp: number;
}
export interface Cert {
  body: CertBody;
  sig: string;
}

export interface TransferBody {
  room: string;
  from: string;
  to: string;
  iat: number;
  exp: number;
}
export interface TransferCert {
  body: TransferBody;
  sig: string;
}

/** 端末の時計のずれを許す秒数（iat より前でもこの範囲なら有効とみなす）。 */
const CLOCK_SKEW_SEC = 60;

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isCertBody = (b: any): b is CertBody =>
  !!b &&
  isStr(b.room) &&
  isStr(b.pid) &&
  isStr(b.name) &&
  isStr(b.pubkey) &&
  (b.role === 'gm' || b.role === 'player') &&
  isNum(b.iat) &&
  isNum(b.exp);

const isTransferBody = (b: any): b is TransferBody =>
  !!b && isStr(b.room) && isStr(b.from) && isStr(b.to) && isNum(b.iat) && isNum(b.exp);

// 同じサーバー鍵で署名するので、用途（typ）を署名対象に含めて取り違えを防ぐ。
export async function issueCert(serverPriv: CryptoKey, body: CertBody): Promise<Cert> {
  return { body, sig: await sign(serverPriv, { typ: 'cert', body }) };
}

export async function issueTransfer(
  serverPriv: CryptoKey,
  body: TransferBody,
): Promise<TransferCert> {
  return { body, sig: await sign(serverPriv, { typ: 'transfer', body }) };
}

async function verifySigned(
  typ: 'cert' | 'transfer',
  serverPub: string,
  body: { room: string; iat: number; exp: number },
  sig: unknown,
  room: string,
  nowSec: number,
): Promise<boolean> {
  try {
    if (!isStr(sig)) return false;
    if (body.room !== room) return false;
    if (!(nowSec < body.exp && nowSec >= body.iat - CLOCK_SKEW_SEC)) return false;
    return await verify(serverPub, { typ, body }, sig);
  } catch {
    return false;
  }
}

export async function verifyCert(serverPub: string, cert: Cert, room: string, nowSec: number) {
  if (!isCertBody(cert?.body)) return false;
  return verifySigned('cert', serverPub, cert.body, cert.sig, room, nowSec);
}

export async function verifyTransfer(
  serverPub: string,
  t: TransferCert,
  room: string,
  nowSec: number,
) {
  if (!isTransferBody(t?.body)) return false;
  return verifySigned('transfer', serverPub, t.body, t.sig, room, nowSec);
}

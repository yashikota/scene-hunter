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

export async function issueCert(serverPriv: CryptoKey, body: CertBody): Promise<Cert> {
  return { body, sig: await sign(serverPriv, body) };
}

export async function issueTransfer(serverPriv: CryptoKey, body: TransferBody): Promise<TransferCert> {
  return { body, sig: await sign(serverPriv, body) };
}

async function verifySigned(
  serverPub: string,
  signed: { body: { room: string; iat: number; exp: number }; sig: string },
  room: string,
  nowSec: number,
): Promise<boolean> {
  try {
    const { body, sig } = signed;
    if (body.room !== room) return false;
    if (!(nowSec < body.exp && nowSec >= body.iat - CLOCK_SKEW_SEC)) return false;
    return await verify(serverPub, body, sig);
  } catch {
    return false;
  }
}

export const verifyCert = (serverPub: string, cert: Cert, room: string, nowSec: number) =>
  verifySigned(serverPub, cert, room, nowSec);

export const verifyTransfer = (serverPub: string, t: TransferCert, room: string, nowSec: number) =>
  verifySigned(serverPub, t, room, nowSec);

import type { Role } from '../shared/cert';

export interface RoomTokenPayload {
  room: string;
  role: Role;
  pid: string;
  exp: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('invalid base64url');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function importKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

/** base64url(payload) + "." + base64url(HMAC-SHA256(secret, base64url(payload))) */
export async function issueRoomToken(secret: string, p: RoomTokenPayload): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(p)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await importKey(secret, 'sign'), encoder.encode(body)));
  return `${body}.${toBase64Url(sig)}`;
}

function isRoomTokenPayload(v: unknown): v is RoomTokenPayload {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.room === 'string' &&
    (o.role === 'gm' || o.role === 'player') &&
    typeof o.pid === 'string' &&
    typeof o.exp === 'number'
  );
}

/** 不正なトークン（形式違い・改ざん・別の secret・期限切れ・壊れた payload）は例外を投げず null を返す。 */
export async function verifyRoomToken(
  secret: string,
  token: string,
  nowSec: number,
): Promise<RoomTokenPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await importKey(secret, 'verify'),
      fromBase64Url(sig),
      encoder.encode(body),
    );
    if (!valid) return null;
    const parsed: unknown = JSON.parse(decoder.decode(fromBase64Url(body)));
    if (!isRoomTokenPayload(parsed)) return null;
    if (nowSec >= parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

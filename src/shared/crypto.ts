const subtle = () => globalThis.crypto.subtle;
const ED25519 = { name: 'Ed25519' } as const;
const encoder = new TextEncoder();

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

/** キーを辞書順に並べた JSON。署名の対象はこの文字列の UTF-8。 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new TypeError('canonicalJson: non-finite number');
    return v;
  }
  if (Array.isArray(v)) return v.map(sortKeys);
  if (typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError('canonicalJson: non-plain object');
    }
    const o = v as Record<string, unknown>;
    // 値が undefined のプロパティは JSON 化で落ちるので、署名側と検証側で揃えて除く。
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => [k, sortKeys(o[k])]),
    );
  }
  throw new TypeError(`canonicalJson: unsupported type ${typeof v}`);
}

export function generateKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey(ED25519, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  return toBase64Url(new Uint8Array(await subtle().exportKey('raw', key)));
}

export function importPublicKey(b64url: string): Promise<CryptoKey> {
  return subtle().importKey('raw', fromBase64Url(b64url), ED25519, true, ['verify']);
}

export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  return toBase64Url(new Uint8Array(await subtle().exportKey('pkcs8', key)));
}

export function importPrivateKey(b64url: string): Promise<CryptoKey> {
  return subtle().importKey('pkcs8', fromBase64Url(b64url), ED25519, true, ['sign']);
}

export async function sign(priv: CryptoKey, value: unknown): Promise<string> {
  const sig = await subtle().sign(ED25519, priv, encoder.encode(canonicalJson(value)));
  return toBase64Url(new Uint8Array(sig));
}

/** 不正な入力（壊れた鍵や署名）でも例外を投げず false を返す。 */
export async function verify(pubB64: string, value: unknown, sig: string): Promise<boolean> {
  try {
    const pub = await importPublicKey(pubB64);
    return await subtle().verify(
      ED25519,
      pub,
      fromBase64Url(sig),
      encoder.encode(canonicalJson(value)),
    );
  } catch {
    return false;
  }
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = new Uint8Array(await subtle().digest('SHA-256', bytes as BufferSource));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

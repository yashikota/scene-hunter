import type { Cert } from '../../shared/cert';
import { exportPrivateKey, exportPublicKey, generateKeyPair } from '../../shared/crypto';
import { isLocale, type Locale } from '../../shared/locales';
import { createRoom, joinRoom, type Joined } from '../api';

// 部屋の一員としての資格（参加証、秘密鍵、部屋トークン）を sessionStorage の `sh:me:{code}` に置く。
// 再読み込みしても同じ pid のまま戻れるように、プレイヤーが送るイベントの seq もここに置く
// （GM の受信側は seq が増えていないメッセージを重複として捨てるため）。

export interface Me {
  code: string;
  pid: string;
  name: string;
  role: 'gm' | 'player';
  roomToken: string;
  cert: Cert;
  /** Ed25519 の秘密鍵（PKCS8 の base64url）。 */
  privateKey: string;
  /** Ed25519 の公開鍵（raw の base64url）。GM の交代で参加証を取り直すときに使う。 */
  pubkey: string;
  moqUrl: string;
  locale: Locale;
  rounds: number;
  limitSec: number;
  /** 次に送る PlayerEvent の seq。 */
  seq: number;
}

const keyOf = (code: string) => `sh:me:${code}`;

export function saveMe(me: Me): void {
  try {
    sessionStorage.setItem(keyOf(me.code), JSON.stringify(me));
  } catch {
    // 保存できなくても、このタブを開いている間は遊べる。
  }
}

/** 無い、または壊れていれば null。 */
export function loadMe(code: string): Me | null {
  try {
    const raw = sessionStorage.getItem(keyOf(code));
    if (raw === null) return null;
    const o = JSON.parse(raw) as Partial<Me> | null;
    if (
      !o ||
      o.code !== code ||
      typeof o.pid !== 'string' ||
      typeof o.name !== 'string' ||
      (o.role !== 'gm' && o.role !== 'player') ||
      typeof o.roomToken !== 'string' ||
      typeof o.cert?.body?.pid !== 'string' ||
      typeof o.privateKey !== 'string' ||
      typeof o.pubkey !== 'string' ||
      typeof o.moqUrl !== 'string' ||
      !isLocale(o.locale) ||
      typeof o.rounds !== 'number' ||
      typeof o.limitSec !== 'number' ||
      !Number.isInteger(o.seq)
    ) {
      return null;
    }
    return o as Me;
  } catch {
    return null;
  }
}

export function clearMe(code: string): void {
  try {
    sessionStorage.removeItem(keyOf(code));
  } catch {
    // 消せなくても、トップに戻れば新しく入り直せる。
  }
}

async function newKeys(): Promise<{ pubkey: string; privateKey: string }> {
  const kp = await generateKeyPair();
  return {
    pubkey: await exportPublicKey(kp.publicKey),
    privateKey: await exportPrivateKey(kp.privateKey),
  };
}

const toMe = (j: Joined, keys: { pubkey: string; privateKey: string }): Me => ({
  code: j.code,
  pid: j.pid,
  name: j.cert.body.name,
  role: j.cert.body.role,
  roomToken: j.roomToken,
  cert: j.cert,
  privateKey: keys.privateKey,
  pubkey: keys.pubkey,
  moqUrl: j.moqUrl,
  locale: j.locale,
  rounds: j.rounds,
  limitSec: j.limitSec,
  seq: 0,
});

/** 部屋を作って GM として保存し、部屋の番号を返す。 */
export async function createAndSave(
  name: string,
  locale: Locale,
  api: Pick<typeof import('../api'), 'createRoom'> = { createRoom },
): Promise<string> {
  const keys = await newKeys();
  const joined = await api.createRoom({ name, pubkey: keys.pubkey, locale });
  saveMe(toMe(joined, keys));
  return joined.code;
}

/** 部屋に入ってプレイヤーとして保存する。部屋がまだ見えない間は onWaiting を呼びながら待つ。 */
export async function joinAndSave(
  code: string,
  name: string,
  opts: { onWaiting?: () => void } = {},
  api: Pick<typeof import('../api'), 'joinRoom'> = { joinRoom },
): Promise<Me> {
  const keys = await newKeys();
  const joined = await api.joinRoom(code, { name, pubkey: keys.pubkey }, { onWaiting: opts.onWaiting });
  const me = toMe(joined, keys);
  saveMe(me);
  return me;
}

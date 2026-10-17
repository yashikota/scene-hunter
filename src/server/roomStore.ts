import type { Locale } from '../shared/locales';

export interface RoomRecord {
  code: string;
  relayUid: string;
  moqToken: string;
  locale: Locale;
  rounds: number;
  limitSec: number;
  createdAt: number;
  /** 現在の GM のプレイヤー ID。交代で書き換わる。 */
  gmPid: string;
  /** 現在の GM になった時刻（UNIX 秒）。これより前に発行された交代証は使えない。 */
  gmSince: number;
}

const ROOM_TTL_SEC = 43200;

const key = (code: string) => `room:${code}`;

export function createRoomStore(kv: Pick<KVNamespace, 'get' | 'put' | 'delete'>) {
  async function get(code: string): Promise<RoomRecord | null> {
    return (await kv.get<RoomRecord>(key(code), 'json')) ?? null;
  }

  async function put(rec: RoomRecord): Promise<boolean> {
    await kv.put(key(rec.code), JSON.stringify(rec), { expirationTtl: ROOM_TTL_SEC });
    const back = await get(rec.code);
    return (
      back?.relayUid === rec.relayUid && back.gmPid === rec.gmPid && back.gmSince === rec.gmSince
    );
  }

  async function del(code: string): Promise<void> {
    await kv.delete(key(code));
  }

  return { put, get, delete: del };
}

// 2^32 を 1,000,000 で割り切れる最大の倍数。これ以上の値は棄却して剰余の偏りを避ける。
const UNBIASED_LIMIT = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;

function secureRoomNumber(): number {
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < UNBIASED_LIMIT) return buf[0] % 1_000_000;
  }
}

/** `rand` はテスト用の差し替え。省略時は CSPRNG と棄却サンプリングを使う。 */
export function randomRoomCode(rand?: () => number): string {
  const n = rand ? Math.floor(rand() * 1_000_000) : secureRoomNumber();
  return String(n).padStart(6, '0');
}

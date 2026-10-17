import type { Locale } from '../shared/locales';

export interface RoomRecord {
  code: string;
  relayUid: string;
  moqToken: string;
  locale: Locale;
  rounds: number;
  limitSec: number;
  createdAt: number;
}

const ROOM_TTL_SEC = 43200;

const key = (code: string) => `room:${code}`;

export function createRoomStore(kv: Pick<KVNamespace, 'get' | 'put' | 'delete'>) {
  return {
    async put(rec: RoomRecord): Promise<boolean> {
      await kv.put(key(rec.code), JSON.stringify(rec), { expirationTtl: ROOM_TTL_SEC });
      const back = await this.get(rec.code);
      return back?.relayUid === rec.relayUid;
    },
    async get(code: string): Promise<RoomRecord | null> {
      return (await kv.get<RoomRecord>(key(code), 'json')) ?? null;
    },
    async delete(code: string): Promise<void> {
      await kv.delete(key(code));
    },
  };
}

export function randomRoomCode(rand: () => number = Math.random): string {
  return String(Math.floor(rand() * 1_000_000)).padStart(6, '0');
}

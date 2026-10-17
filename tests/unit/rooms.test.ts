import { beforeAll, describe, expect, it } from 'vite-plus/test';
import { verifyCert } from '../../src/shared/cert';
import { exportPublicKey, generateKeyPair } from '../../src/shared/crypto';
import { issueRoomToken } from '../../src/server/hmac';
import { createRoomStore } from '../../src/server/roomStore';
import { claimGm, closeRoom, createRoom, joinRoom, transferGm } from '../../src/server/services/rooms';
import type { RoomDeps } from '../../src/server/services/rooms';

const NOW_MS = 1_800_000_000_000;
const NOW_SEC = NOW_MS / 1000;
let serverPub: string;
let pubkey: string;
let serverKey: CryptoKey;

beforeAll(async () => {
  const s = await generateKeyPair();
  serverKey = s.privateKey;
  serverPub = await exportPublicKey(s.publicKey);
  pubkey = await exportPublicKey((await generateKeyPair()).publicKey);
});

function setup(opts: { codes?: string[]; putFalseTimes?: number } = {}) {
  const kvMap = new Map<string, string>();
  const deleted: string[] = [];
  const r2Deleted: string[][] = [];
  const r2Prefixes: (string | undefined)[] = [];
  let relayN = 0;
  let putFalse = opts.putFalseTimes ?? 0;
  const codes = [...(opts.codes ?? ['111111', '222222', '333333'])];
  let idN = 0;

  const kv = {
    get: async (k: string) => (kvMap.has(k) ? JSON.parse(kvMap.get(k)!) : null),
    put: async (k: string, v: string) => void kvMap.set(k, v),
    delete: async (k: string) => void kvMap.delete(k),
  } as never;
  const realStore = createRoomStore(kv);
  const store = {
    ...realStore,
    put: async (rec: Parameters<typeof realStore.put>[0]) => {
      if (putFalse > 0) {
        putFalse--;
        return false;
      }
      return realStore.put(rec);
    },
  };
  const pages = [
    { objects: [{ key: 'rooms/111111/1/a.jpg' }], truncated: true, cursor: 'c1' },
    { objects: [{ key: 'rooms/111111/2/b.jpg' }], truncated: false },
  ];
  const d: RoomDeps = {
    relay: {
      create: async (name) => {
        relayN++;
        return { uid: `uid-${relayN}-${name}`, token: `TOKEN${relayN}` };
      },
      delete: async (uid) => void deleted.push(uid),
      list: async () => [],
    },
    store,
    storage: {
      list: async (o: { prefix?: string; cursor?: string }) => {
        r2Prefixes.push(o.prefix);
        return (o.cursor ? pages[1] : pages[0]) as never;
      },
      delete: async (keys: string | string[]) => void r2Deleted.push([keys].flat()),
    } as never,
    hmacSecret: 'secret',
    serverKey,
    now: () => NOW_MS,
    newId: () => `pid-${++idN}`,
    randomCode: () => codes.shift() ?? '999999',
  };
  return { d, kvMap, deleted, r2Deleted, r2Prefixes };
}

const input = { name: 'はるか', locale: 'ja' as const };

describe('createRoom', () => {
  it('既定値を保存し、GM の参加証と Relay のトークンで終わる URL を返す', async () => {
    const { d, kvMap } = setup();
    const j = await createRoom(d, { ...input, pubkey });
    expect(j).toMatchObject({ code: '111111', rounds: 3, limitSec: 60, locale: 'ja', pid: 'pid-1' });
    expect(j.cert.body).toMatchObject({ role: 'gm', room: '111111', pubkey, name: 'はるか' });
    expect(j.cert.body.exp - j.cert.body.iat).toBe(43200);
    expect(await verifyCert(serverPub, j.cert, '111111', NOW_SEC)).toBe(true);
    expect(j.moqUrl.endsWith('/TOKEN1')).toBe(true);
    expect(JSON.parse(kvMap.get('room:111111')!)).toMatchObject({
      relayUid: 'uid-1-sh-111111',
      locale: 'ja',
      rounds: 3,
      limitSec: 60,
    });
  });

  it('名前の前後の空白を落とす', async () => {
    const { d } = setup();
    const j = await createRoom(d, { ...input, name: '  ab  ', pubkey });
    expect(j.cert.body.name).toBe('ab');
  });

  it('範囲外は RangeError', async () => {
    const { d } = setup();
    await expect(createRoom(d, { ...input, pubkey, rounds: 11 })).rejects.toThrow(RangeError);
    await expect(createRoom(d, { ...input, pubkey, rounds: 0 })).rejects.toThrow(RangeError);
    await expect(createRoom(d, { ...input, pubkey, limitSec: 20 })).rejects.toThrow(RangeError);
    await expect(createRoom(d, { ...input, pubkey, limitSec: 121 })).rejects.toThrow(RangeError);
    await expect(createRoom(d, { ...input, pubkey, name: 'あ'.repeat(13) })).rejects.toThrow(RangeError);
    await expect(createRoom(d, { ...input, pubkey, name: '   ' })).rejects.toThrow(RangeError);
    await expect(createRoom(d, { ...input, pubkey: 'bad' })).rejects.toThrow(RangeError);
  });

  it('put が false なら Relay を 1 本消して別の番号で作り直す', async () => {
    const { d, deleted } = setup({ putFalseTimes: 1 });
    const j = await createRoom(d, { ...input, pubkey });
    expect(j.code).toBe('222222');
    expect(deleted).toEqual(['uid-1-sh-111111']);
  });

  it('3 回続けて衝突したら Error で、作った Relay はすべて消す', async () => {
    const { d, deleted } = setup({ putFalseTimes: 3 });
    await expect(createRoom(d, { ...input, pubkey })).rejects.toThrow(Error);
    expect(deleted).toHaveLength(3);
  });
});

describe('joinRoom', () => {
  it('存在しない番号は not_found', async () => {
    const { d } = setup();
    expect(await joinRoom(d, '000000', { name: 'a', pubkey })).toEqual({ error: 'not_found' });
  });

  it('player の参加証に送った pubkey を入れる', async () => {
    const { d } = setup();
    await createRoom(d, { ...input, pubkey });
    const other = await exportPublicKey((await generateKeyPair()).publicKey);
    const j = await joinRoom(d, '111111', { name: 'たろう', pubkey: other });
    if ('error' in j) throw new Error('unexpected');
    expect(j.cert.body).toMatchObject({ role: 'player', pubkey: other, name: 'たろう', room: '111111' });
    expect(j).toMatchObject({ locale: 'ja', rounds: 3, limitSec: 60 });
    expect(j.moqUrl.endsWith('/TOKEN1')).toBe(true);
    expect(j.pid).not.toBe('pid-1');
  });
});

describe('GM 交代', () => {
  async function lobby() {
    const s = setup();
    const gm = await createRoom(s.d, { ...input, pubkey });
    const kp = await generateKeyPair();
    const ppub = await exportPublicKey(kp.publicKey);
    const p = await joinRoom(s.d, '111111', { name: 'p', pubkey: ppub });
    if ('error' in p) throw new Error('unexpected');
    return { ...s, gm, p, ppub };
  }

  it('プレイヤーのトークンでは transferGm が Error', async () => {
    const { d, p, gm } = await lobby();
    await expect(transferGm(d, p.roomToken, gm.pid)).rejects.toThrow(Error);
    await expect(transferGm(d, 'garbage', p.pid)).rejects.toThrow(Error);
  });

  it('別の部屋の番号を添えると拒否する', async () => {
    const { d, gm, p } = await lobby();
    await expect(transferGm(d, gm.roomToken, p.pid, '222222')).rejects.toThrow(Error);
  });

  it('claimGm は to が違うと Error、正しいと role: gm の参加証', async () => {
    const { d, gm, p, ppub } = await lobby();
    const t = await transferGm(d, gm.roomToken, p.pid);
    expect(t.body).toMatchObject({ room: '111111', from: gm.pid, to: p.pid });

    const third = await joinRoom(d, '111111', { name: 'q', pubkey: ppub });
    if ('error' in third) throw new Error('unexpected');
    await expect(claimGm(d, third.roomToken, t, ppub)).rejects.toThrow(Error);
    await expect(claimGm(d, gm.roomToken, t, ppub)).rejects.toThrow(Error);

    const c = await claimGm(d, p.roomToken, t, ppub);
    expect(c.cert.body).toMatchObject({ role: 'gm', pid: p.pid, pubkey: ppub, room: '111111' });
    expect(await verifyCert(serverPub, c.cert, '111111', NOW_SEC)).toBe(true);
    // 返ってきたトークンで GM の操作ができる
    await expect(transferGm(d, c.roomToken, gm.pid)).resolves.toBeDefined();
  });

  it('改ざんした交代証は拒否する', async () => {
    const { d, gm, p, ppub } = await lobby();
    const t = await transferGm(d, gm.roomToken, gm.pid === p.pid ? 'x' : 'someone-else');
    const forged = { ...t, body: { ...t.body, to: p.pid } };
    await expect(claimGm(d, p.roomToken, forged, ppub)).rejects.toThrow(Error);
  });

  it('期限切れのトークンは拒否する', async () => {
    const { d, p } = await lobby();
    const expired = await issueRoomToken('secret', {
      room: '111111',
      role: 'gm',
      pid: p.pid,
      exp: NOW_SEC - 1,
    });
    await expect(transferGm(d, expired, 'x')).rejects.toThrow(Error);
  });
});

describe('closeRoom', () => {
  it('Relay、R2 の rooms/{code}/ 以下、KV を消す', async () => {
    const { d, gm, deleted, r2Deleted, r2Prefixes, kvMap } = await (async () => {
      const s = setup();
      const gm = await createRoom(s.d, { ...input, pubkey });
      return { ...s, gm };
    })();
    await closeRoom(d, gm.roomToken, '111111');
    expect(deleted).toEqual(['uid-1-sh-111111']);
    expect(r2Prefixes).toEqual(['rooms/111111/', 'rooms/111111/']);
    expect(r2Deleted).toEqual([['rooms/111111/1/a.jpg'], ['rooms/111111/2/b.jpg']]);
    expect(kvMap.has('room:111111')).toBe(false);
  });

  it('プレイヤーのトークンでは閉じられない', async () => {
    const s = setup();
    await createRoom(s.d, { ...input, pubkey });
    const p = await joinRoom(s.d, '111111', { name: 'p', pubkey });
    if ('error' in p) throw new Error('unexpected');
    await expect(closeRoom(s.d, p.roomToken)).rejects.toThrow(Error);
    expect(s.deleted).toEqual([]);
  });
});

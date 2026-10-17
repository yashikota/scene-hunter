import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { verifyCert } from '../../src/shared/cert';
import { exportPublicKey, generateKeyPair } from '../../src/shared/crypto';
import { issueRoomToken } from '../../src/server/hmac';
import { createRoomStore } from '../../src/server/roomStore';
import {
  AuthError,
  NotFoundError,
  claimGm,
  closeRoom,
  createRoom,
  joinRoom,
  transferGm,
} from '../../src/server/services/rooms';
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
  let relayDeleteFails = false;
  const d: RoomDeps = {
    relay: {
      create: async (name) => {
        relayN++;
        return { uid: `uid-${relayN}-${name}`, token: `TOKEN${relayN}` };
      },
      delete: async (uid) => {
        deleted.push(uid);
        if (relayDeleteFails) throw new Error('relay delete failed');
      },
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
  return { d, failRelayDelete: () => void (relayDeleteFails = true), kvMap, deleted, r2Deleted, r2Prefixes };
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
    await expect(createRoom(d, { ...input, pubkey })).rejects.toThrow('could not allocate');
    expect(deleted).toHaveLength(3);
  });

  it('Relay の後始末が失敗しても元の例外を隠さない', async () => {
    const { d, failRelayDelete } = setup();
    failRelayDelete();
    d.store.put = async () => {
      throw new Error('kv down');
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(createRoom(d, { ...input, pubkey })).rejects.toThrow('kv down');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('GM の pid を KV に保存する', async () => {
    const { d, kvMap } = setup();
    await createRoom(d, { ...input, pubkey });
    expect(JSON.parse(kvMap.get('room:111111')!).gmPid).toBe('pid-1');
  });
});

describe('joinRoom', () => {
  it('6 桁の数字でない番号は not_found', async () => {
    const { d } = setup();
    expect(await joinRoom(d, 'abc', { name: 'a', pubkey })).toEqual({ error: 'not_found' });
    expect(await joinRoom(d, '1234567', { name: 'a', pubkey })).toEqual({ error: 'not_found' });
  });

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
    const ppub = await exportPublicKey((await generateKeyPair()).publicKey);
    const p = await joinRoom(s.d, '111111', { name: 'p', pubkey: ppub });
    if ('error' in p) throw new Error('unexpected');
    return { ...s, gm, p, ppub };
  }
  const claimInput = (pub: string) => ({ name: 'ぷれいや', pubkey: pub });

  it('プレイヤーのトークンでは transferGm が AuthError', async () => {
    const { d, p, gm } = await lobby();
    await expect(transferGm(d, p.roomToken, gm.pid, '111111')).rejects.toThrow(AuthError);
    await expect(transferGm(d, 'garbage', p.pid, '111111')).rejects.toThrow(AuthError);
  });

  it('別の部屋の番号を添えると AuthError、形式違いや存在しない部屋は NotFoundError', async () => {
    const { d, gm, p } = await lobby();
    await createRoom(d, { ...input, pubkey }); // 222222
    await expect(transferGm(d, gm.roomToken, p.pid, '222222')).rejects.toThrow(AuthError);
    await expect(transferGm(d, gm.roomToken, p.pid, 'abc')).rejects.toThrow(NotFoundError);
    await expect(closeRoom(d, gm.roomToken, '12345')).rejects.toThrow(NotFoundError);
  });

  it('claimGm は to が違うと AuthError、正しいと名前入りの role: gm の参加証', async () => {
    const { d, gm, p, ppub, kvMap } = await lobby();
    const t = await transferGm(d, gm.roomToken, p.pid, '111111');
    expect(t.body).toMatchObject({ room: '111111', from: gm.pid, to: p.pid });

    const third = await joinRoom(d, '111111', { name: 'q', pubkey: ppub });
    if ('error' in third) throw new Error('unexpected');
    await expect(claimGm(d, third.roomToken, t, claimInput(ppub), '111111')).rejects.toThrow(AuthError);
    await expect(claimGm(d, gm.roomToken, t, claimInput(ppub), '111111')).rejects.toThrow(AuthError);

    const c = await claimGm(d, p.roomToken, t, claimInput(ppub), '111111');
    expect(c.cert.body).toMatchObject({
      role: 'gm',
      pid: p.pid,
      pubkey: ppub,
      room: '111111',
      name: 'ぷれいや',
    });
    expect(await verifyCert(serverPub, c.cert, '111111', NOW_SEC)).toBe(true);
    expect(JSON.parse(kvMap.get('room:111111')!).gmPid).toBe(p.pid);
    await expect(transferGm(d, c.roomToken, gm.pid, '111111')).resolves.toBeDefined();
  });

  it('claimGm の名前は join と同じ検証', async () => {
    const { d, gm, p, ppub } = await lobby();
    const t = await transferGm(d, gm.roomToken, p.pid, '111111');
    await expect(
      claimGm(d, p.roomToken, t, { name: '  ', pubkey: ppub }, '111111'),
    ).rejects.toThrow(RangeError);
    await expect(
      claimGm(d, p.roomToken, t, { name: 'あ'.repeat(13), pubkey: ppub }, '111111'),
    ).rejects.toThrow(RangeError);
  });

  it('交代後の元の GM は transfer も close もできない', async () => {
    const { d, gm, p, ppub, deleted } = await lobby();
    const t = await transferGm(d, gm.roomToken, p.pid, '111111');
    await claimGm(d, p.roomToken, t, claimInput(ppub), '111111');
    await expect(transferGm(d, gm.roomToken, p.pid, '111111')).rejects.toThrow(AuthError);
    await expect(closeRoom(d, gm.roomToken, '111111')).rejects.toThrow(AuthError);
    expect(deleted).toEqual([]);
  });

  it('部屋 A のプレイヤーのトークンで部屋 B に claim すると AuthError', async () => {
    const { d, gm, p, ppub } = await lobby();
    await createRoom(d, { ...input, pubkey }); // 222222
    const t = await transferGm(d, gm.roomToken, p.pid, '111111');
    await expect(claimGm(d, p.roomToken, t, claimInput(ppub), '222222')).rejects.toThrow(AuthError);
  });

  it('改ざんした交代証は AuthError', async () => {
    const { d, gm, p, ppub } = await lobby();
    const t = await transferGm(d, gm.roomToken, 'someone-else', '111111');
    const forged = { ...t, body: { ...t.body, to: p.pid } };
    await expect(claimGm(d, p.roomToken, forged, claimInput(ppub), '111111')).rejects.toThrow(AuthError);
  });

  it('自分への交代は RangeError', async () => {
    const { d, gm } = await lobby();
    await expect(transferGm(d, gm.roomToken, gm.pid, '111111')).rejects.toThrow(RangeError);
  });

  it('期限切れのトークンは AuthError', async () => {
    const { d, p } = await lobby();
    const expired = await issueRoomToken('secret', {
      room: '111111',
      role: 'gm',
      pid: p.pid,
      exp: NOW_SEC - 1,
    });
    await expect(transferGm(d, expired, 'x', '111111')).rejects.toThrow(AuthError);
  });
});

describe('closeRoom', () => {
  it('Relay、R2 の rooms/{code}/ 以下、KV を消す', async () => {
    const s = setup();
    const gm = await createRoom(s.d, { ...input, pubkey });
    await closeRoom(s.d, gm.roomToken, '111111');
    expect(s.deleted).toEqual(['uid-1-sh-111111']);
    expect(s.r2Prefixes).toEqual(['rooms/111111/', 'rooms/111111/']);
    expect(s.r2Deleted).toEqual([['rooms/111111/1/a.jpg'], ['rooms/111111/2/b.jpg']]);
    expect(s.kvMap.has('room:111111')).toBe(false);
  });

  it('プレイヤーのトークンでは閉じられない', async () => {
    const s = setup();
    await createRoom(s.d, { ...input, pubkey });
    const p = await joinRoom(s.d, '111111', { name: 'p', pubkey });
    if ('error' in p) throw new Error('unexpected');
    await expect(closeRoom(s.d, p.roomToken, '111111')).rejects.toThrow(AuthError);
    expect(s.deleted).toEqual([]);
  });

  it('部屋 A のトークンで部屋 B の番号を閉じようとすると AuthError', async () => {
    const s = setup();
    const a = await createRoom(s.d, { ...input, pubkey });
    await createRoom(s.d, { ...input, pubkey }); // 222222
    await expect(closeRoom(s.d, a.roomToken, '222222')).rejects.toThrow(AuthError);
    expect(s.deleted).toEqual([]);
  });

  it('閉じた後の部屋は NotFoundError', async () => {
    const s = setup();
    const gm = await createRoom(s.d, { ...input, pubkey });
    await closeRoom(s.d, gm.roomToken, '111111');
    await expect(closeRoom(s.d, gm.roomToken, '111111')).rejects.toThrow(NotFoundError);
  });
});

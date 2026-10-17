// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { GmEngine } from '../../src/client/game/gmEngine';
import { claimUntilDone, loadMe, rejoinUntilDone, type Me } from '../../src/client/game/membership';
import { PlayerEngine, REJOIN_AFTER_MS } from '../../src/client/game/playerEngine';
import { newGameId } from '../../src/client/game/useRoom';
import { issueCert, issueTransfer, type Cert } from '../../src/shared/cert';
import { FakeRelay } from './fakeMoq';
import { makeIdentities, ROOM } from './moqKeys';

type Identity = Awaited<ReturnType<Awaited<ReturnType<typeof makeIdentities>>['mk']>>;

const meOf = (id: Identity, role: 'gm' | 'player', seq = 0): Me => ({
  code: ROOM,
  pid: id.cert.body.pid,
  name: id.cert.body.name,
  role,
  roomToken: 't',
  cert: id.cert as Cert,
  privateKey: '',
  pubkey: id.cert.body.pubkey,
  moqUrl: 'https://relay/x',
  locale: 'ja',
  rounds: 3,
  limitSec: 60,
  seq,
});

async function setup() {
  const keys = await makeIdentities();
  const relay = new FakeRelay();
  const gmId = await keys.mk('gm', 'gm');
  const aliceId = await keys.mk('alice', 'player');
  const startGm = () => {
    const gm = new GmEngine(meOf(gmId, 'gm'), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: gmId.kp.privateKey,
      now: () => Date.now(),
    });
    gm.start();
    return gm;
  };
  const startPlayer = (seq = 0) => {
    const saved: number[] = [];
    const p = new PlayerEngine(meOf(aliceId, 'player', seq), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: aliceId.kp.privateKey,
      serverPub: '',
      now: () => Date.now(),
      saveSeq: (n) => saved.push(n),
      onTransferToMe: () => {},
    });
    p.start();
    return { p, saved };
  };
  return { relay, startGm, startPlayer };
}

const read = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null');

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('GmEngine', () => {
  it('epoch は 1 から始まり、再開のたびに 1 つ上がり、イベントの seq は続きから数える', async () => {
    const { startGm } = await setup();
    const a = startGm();
    expect(a.epoch).toBe(1);
    a.dispatch({ type: 'playerJoined', pid: 'p1', name: 'A', at: 0 }); // lobby イベント（seq 0）
    await a.flush();
    a.close();
    expect(read(`sh:gmlink:${ROOM}`)).toMatchObject({ epoch: 1, eventSeq: 0 });

    const b = startGm();
    expect(b.epoch).toBe(2);
    // 保存した状態から戻る
    expect(Object.keys(b.state.players)).toEqual(['p1']);
    b.dispatch({ type: 'playerJoined', pid: 'p2', name: 'B', at: 0 });
    await b.flush();
    b.close();
    expect(read(`sh:gmlink:${ROOM}`)).toMatchObject({ epoch: 2, eventSeq: 1 });
  });

  it('GM を引き継ぐときは前の GM の epoch を越える', async () => {
    const { startGm } = await setup();
    const gm = startGm();
    gm.close();
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    const id = await keys.mk('bob', 'gm');
    const next = new GmEngine(meOf(id, 'gm'), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: id.kp.privateKey,
      now: () => Date.now(),
    });
    next.start(7);
    expect(next.epoch).toBe(8);
    next.close();
  });

  it('GameId は 16 文字の小文字の 16 進数', () => {
    expect(newGameId()).toMatch(/^[0-9a-f]{16}$/);
    expect(newGameId()).not.toBe(newGameId());
  });
});

describe('GM とプレイヤー（偽の Relay）', () => {
  it('プレイヤーが入ると GM の一覧に載り、プレイヤーの画面もロビーになる', async () => {
    const { startGm, startPlayer } = await setup();
    const gm = startGm();
    const { p, saved } = startPlayer();
    await vi.waitFor(() => expect(gm.state.players.alice?.label).toBe('alice'));
    await vi.waitFor(() => expect(p.view.phase).toBe('lobby'));
    await vi.waitFor(() => expect(p.view.players.map((x) => x.pid)).toEqual(['alice']));
    expect(p.gmName()).toBe('gm');
    expect(saved).toEqual([1]); // join で seq 0 を使った
    p.close();
    gm.close();
  });

  it('再読み込みしたプレイヤーは保存した seq から続け、GM に捨てられない', async () => {
    const { startGm, startPlayer } = await setup();
    const gm = startGm();
    const first = startPlayer();
    await vi.waitFor(() => expect(first.p.view.phase).toBe('lobby'));
    gm.dispatch({ type: 'start', gameId: 'g1' });
    gm.dispatch({ type: 'gmPhotoUploaded', key: 'k' });
    gm.dispatch({ type: 'hintsReady', hints: ['a', 'b', 'c', 'd', 'e'], at: Date.now() });
    await vi.waitFor(() => expect(first.p.view.phase).toBe('playerTurn'));
    first.p.close();

    const second = startPlayer(first.saved.at(-1));
    await vi.waitFor(() => expect(second.p.view.phase).toBe('playerTurn'));
    second.p.send({ type: 'shutter', round: 1, hash: 'h' });
    await vi.waitFor(() => expect(gm.state.shutters.alice?.hash).toBe('h'));
    second.p.close();
    gm.close();
  });

  it('GM のイベントはスナップショットの lastEventSeq と揃い、取りこぼしが無ければ resync を送らない', async () => {
    const { startGm, startPlayer } = await setup();
    const gm = startGm();
    const { p, saved } = startPlayer();
    await vi.waitFor(() => expect(p.view.players).toHaveLength(1));
    gm.dispatch({ type: 'start', gameId: 'g1' });
    await vi.waitFor(() => expect(p.view.phase).toBe('gmTurn'));
    expect(p.view.lastSeq).toBe(read(`sh:gmlink:${ROOM}`).eventSeq);
    expect(saved).toEqual([1]); // join だけ
    p.close();
    gm.close();
  });

  it('解散の後に届くものでロビーに戻らない', async () => {
    const { startGm, startPlayer } = await setup();
    const gm = startGm();
    const { p } = startPlayer();
    await vi.waitFor(() => expect(p.view.phase).toBe('lobby'));
    gm.dispatch({ type: 'dissolve' });
    await vi.waitFor(() => expect(p.view.phase).toBe('dissolved'));
    // 解散した GM は以後スナップショットを書かない
    const before = read(`sh:gmlink:${ROOM}`).snapshotSeq;
    gm.dispatch({ type: 'playerJoined', pid: 'x', name: 'x', at: 0 });
    expect(read(`sh:gmlink:${ROOM}`).snapshotSeq).toBe(before);
    expect(p.view.phase).toBe('dissolved');
    p.close();
    gm.close();
  });
});

describe('GM の交代（偽の Relay）', () => {
  it('transfer イベントで全員が交代先に従い、交代先は claim をやり直して新しい epoch で GM になる', async () => {
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    const gmId = await keys.mk('gm', 'gm');
    const aliceId = await keys.mk('alice', 'player');
    const bobId = await keys.mk('bob', 'player');
    const now = () => Date.now();
    const gm = new GmEngine(meOf(gmId, 'gm'), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: gmId.kp.privateKey,
      now,
    });
    gm.start();
    const transfers: unknown[] = [];
    const player = (id: Identity) => {
      const p = new PlayerEngine(meOf(id, 'player'), {
        connector: relay.connector,
        verifier: keys.verifier(),
        privateKey: id.kp.privateKey,
        serverPub: keys.serverPub,
        now,
        saveSeq: () => {},
        onTransferToMe: (t) => transfers.push(t),
      });
      p.start();
      return p;
    };
    const alice = player(aliceId);
    const bob = player(bobId);
    await vi.waitFor(() => expect(Object.keys(gm.state.players).sort()).toEqual(['alice', 'bob']));
    await vi.waitFor(() => expect(bob.view.players).toHaveLength(2));
    expect(bob.gmPid).toBe('gm');

    const nowSec = Math.floor(Date.now() / 1000);
    const transfer = await issueTransfer(keys.server.privateKey, {
      room: ROOM,
      from: 'gm',
      to: 'alice',
      iat: nowSec,
      exp: nowSec + 600,
    });
    gm.dispatch({ type: 'transferred', transfer });
    await gm.flush();
    await vi.waitFor(() => expect(transfers).toEqual([transfer]));
    await vi.waitFor(() => expect(bob.gmPid).toBe('alice'));
    expect(bob.view.lastSeq).toBe(-1); // 新しい GM の seq は 0 から
    gm.close();

    // 1 回目の claim は通信の失敗。やり直しで GM の参加証を受け取る。
    const gmCert = await issueCert(keys.server.privateKey, { ...aliceId.cert.body, role: 'gm' });
    const claim = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }))
      .mockResolvedValueOnce({ roomToken: 't2', cert: gmCert });
    const sleeps: number[] = [];
    const fromEpoch = alice.epoch;
    expect(fromEpoch).toBe(1);
    const next = await claimUntilDone(
      meOf(aliceId, 'player'),
      { kind: 'claim', transfer, fromEpoch },
      { claim, retry: { sleep: async (ms) => void sleeps.push(ms), nowSec: () => nowSec } },
    );
    expect(claim).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([1000]);
    expect(next).toMatchObject({ role: 'gm', roomToken: 't2', pid: 'alice' });
    alice.close();

    const newGm = new GmEngine(next!, {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: aliceId.kp.privateKey,
      now,
    });
    newGm.start(fromEpoch);
    expect(newGm.epoch).toBe(2);
    await vi.waitFor(() => expect(bob.epoch).toBe(2));
    await vi.waitFor(() => expect(bob.view.gmPid).toBe('alice'));
    expect(bob.gmName()).toBe('alice');
    bob.close();
    newGm.close();
  });

  it('claim はやり直しても通らない失敗ならあきらめ、交代証の期限が過ぎてもあきらめる', async () => {
    const keys = await makeIdentities();
    const aliceId = await keys.mk('alice', 'player');
    const transfer = await issueTransfer(keys.server.privateKey, {
      room: ROOM,
      from: 'gm',
      to: 'alice',
      iat: 0,
      exp: 100,
    });
    const step = { kind: 'claim' as const, transfer, fromEpoch: 1 };
    const notFound = vi.fn().mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }));
    const retry = { sleep: async () => {}, nowSec: () => 50 };
    expect(await claimUntilDone(meOf(aliceId, 'player'), step, { claim: notFound, retry })).toBeNull();
    expect(notFound).toHaveBeenCalledTimes(1);

    let t = 50;
    const failing = vi.fn(async () => {
      t += 30;
      throw new Error('offline');
    });
    const sleeps: number[] = [];
    const r = await claimUntilDone(meOf(aliceId, 'player'), step, {
      claim: failing,
      retry: { sleep: async (ms) => void sleeps.push(ms), nowSec: () => t },
    });
    expect(r).toBeNull();
    expect(failing).toHaveBeenCalledTimes(2); // 50 → 80 → 110（期限 100 を過ぎた）
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('入り直しは通信の失敗をやり直す', async () => {
    const keys = await makeIdentities();
    const gmId = await keys.mk('gm', 'gm');
    const playerCert = await issueCert(keys.server.privateKey, { ...gmId.cert.body, pid: 'p2', role: 'player' });
    const join = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        code: ROOM,
        pid: 'p2',
        roomToken: 'pt',
        cert: playerCert,
        moqUrl: 'https://relay/x',
        locale: 'ja',
        rounds: 3,
        limitSec: 60,
      });
    const next = await rejoinUntilDone(
      { ...meOf(gmId, 'gm'), pending: { kind: 'rejoin', gmPid: 'alice' } },
      { join, retry: { sleep: async () => {}, nowSec: () => 0 } },
    );
    expect(join).toHaveBeenCalledTimes(2);
    expect(next).toMatchObject({ pid: 'p2', role: 'player', roomToken: 'pt', seq: 0 });
    expect(next?.pending).toBeUndefined();
    expect(loadMe(ROOM)?.pid).toBe('p2');
  });
});

describe('一覧に載らないときの publish のやり直し', () => {
  it('8 秒から倍々に間隔を伸ばす', async () => {
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    const gmId = await keys.mk('gm', 'gm');
    const aliceId = await keys.mk('alice', 'player');
    const gm = new GmEngine(meOf(gmId, 'gm'), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: gmId.kp.privateKey,
      now: () => Date.now(),
    });
    gm.start();
    relay.dropAnnounce = true; // GM はプレイヤーの announce を受け取れず、一覧に載せられない
    let clock = 0;
    let checks = 0;
    const p = new PlayerEngine(meOf(aliceId, 'player'), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: aliceId.kp.privateKey,
      serverPub: keys.serverPub,
      now: () => (checks++, clock),
      saveSeq: () => {},
      onTransferToMe: () => {},
    });
    p.start();
    const publishes = () =>
      relay.connections.flatMap((c) => c.publishes).filter((x) => x.path === 'p/alice').length;
    /** 1 秒おきの確認が、あと n 回走るまで待つ。 */
    const ticks = async (n: number) => {
      const from = checks;
      await vi.waitFor(() => expect(checks).toBeGreaterThanOrEqual(from + n), { timeout: 1500 * n });
    };
    await vi.waitFor(() => expect(p.view.phase).toBe('lobby'));
    expect(publishes()).toBe(1);
    await ticks(1); // 載っていないことに気付いた時刻 = 0
    clock = REJOIN_AFTER_MS;
    await vi.waitFor(() => expect(publishes()).toBe(2), { timeout: 3000 });
    clock = REJOIN_AFTER_MS * 2; // 次は 16 秒後なので、まだ
    await ticks(2);
    expect(publishes()).toBe(2);
    clock = REJOIN_AFTER_MS * 3;
    await vi.waitFor(() => expect(publishes()).toBe(3), { timeout: 3000 });
    p.close();
    gm.close();
  }, 20_000);
});

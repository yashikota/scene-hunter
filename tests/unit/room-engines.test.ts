// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { GmEngine } from '../../src/client/game/gmEngine';
import type { Me } from '../../src/client/game/membership';
import { PlayerEngine } from '../../src/client/game/playerEngine';
import { newGameId } from '../../src/client/game/useRoom';
import type { Cert } from '../../src/shared/cert';
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

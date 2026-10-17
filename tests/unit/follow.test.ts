import { describe, expect, it, vi } from 'vite-plus/test';
import { followGm } from '../../src/client/moq/follow';
import { MoqSession } from '../../src/client/moq/session';
import { issueCert, type CertBody } from '../../src/shared/cert';
import { exportPublicKey, generateKeyPair } from '../../src/shared/crypto';
import { EnvelopeVerifier, seal } from '../../src/shared/envelope';
import type { GmEvent, GmSnapshot } from '../../src/shared/protocol';
import { FakeRelay, flush } from './fakeMoq';

const ROOM = '123456';
const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

async function setup(opts: { dropAnnounce?: boolean } = {}) {
  const server = await generateKeyPair();
  const serverPub = await exportPublicKey(server.publicKey);
  const mk = async (pid: string, role: CertBody['role']) => {
    const kp = await generateKeyPair();
    const cert = await issueCert(server.privateKey, {
      room: ROOM,
      pid,
      name: pid,
      role,
      pubkey: await exportPublicKey(kp.publicKey),
      iat: 0,
      exp: 2000,
    });
    // 参加証付きの封筒をバイト列にする
    const frame = async (body: Record<string, unknown>) =>
      enc(await seal({ pid, ...body }, kp.privateKey, cert));
    return { kp, cert, frame };
  };
  const relay = new FakeRelay();
  relay.dropAnnounce = opts.dropAnnounce ?? false;
  const session = new MoqSession('https://relay/x', relay.connector);
  await session.start();
  const verifier = new EnvelopeVerifier(serverPub, ROOM, () => 1000);
  const seen = { events: [] as GmEvent[], snapshots: [] as GmSnapshot[], epochs: [] as number[] };
  const on = {
    event: (e: GmEvent) => seen.events.push(e),
    snapshot: (s: GmSnapshot) => seen.snapshots.push(s),
    epoch: (n: number) => seen.epochs.push(n),
  };
  return { relay, session, verifier, mk, seen, on };
}

/** GM 役の接続で gm/{epoch} の events と state を publish する。 */
function gmBroadcast(relay: FakeRelay, epoch: number) {
  const c = relay.connect();
  const events = c.publish(`gm/${epoch}`, 'events').appendGroup();
  const state = c.publish(`gm/${epoch}`, 'state');
  return {
    conn: c,
    event: (b: Uint8Array) => events.writeFrame(b),
    snapshot: (b: Uint8Array) => state.appendGroup().writeFrame(b),
  };
}

const snapshotBody = (epoch: number, seq: number) => ({
  epoch,
  seq,
  lastEventSeq: -1,
  type: 'snapshot',
  phase: 'lobby',
  round: 0,
  rounds: 3,
  limitSec: 60,
  locale: 'ja',
  players: [],
  gmPid: 'gm',
  gameId: null,
  hints: [],
  turnElapsedMs: null,
  submitted: [],
  results: null,
  ranking: null,
  final: null,
});

const isGm = (pid: string) => pid === 'gm';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('followGm', () => {
  it('follows epoch 1 by announce, then subscribes epoch 2 without announce and switches', async () => {
    const t = await setup();
    const gm = await t.mk('gm', 'gm');
    const stop = followGm(t.session, t.verifier, isGm, t.on);

    const e1 = gmBroadcast(t.relay, 1);
    e1.snapshot(await gm.frame(snapshotBody(1, 0)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1]));
    await vi.waitFor(() => expect(t.seen.snapshots).toHaveLength(1));
    e1.event(await gm.frame({ epoch: 1, seq: 1, type: 'hinting' }));
    await vi.waitFor(() => expect(t.seen.events.map((e) => e.type)).toEqual(['hinting']));

    // GM が再接続して epoch 2 で publish するが、announce は届かない
    t.relay.dropAnnounce = true;
    e1.conn.close();
    const e2 = gmBroadcast(t.relay, 2);
    e2.snapshot(await gm.frame(snapshotBody(2, 2)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1, 2]), { timeout: 3000 });
    await vi.waitFor(() => expect(t.seen.snapshots.map((s) => s.seq)).toEqual([0, 2]));
    // epoch 2 の購読は announce を待たない
    const probes = t.relay.connections
      .flatMap((c) => c.subscribes)
      .filter((x) => x.path === 'gm/2');
    expect(probes.every((x) => !x.announced)).toBe(true);

    e2.event(await gm.frame({ epoch: 2, seq: 3, type: 'hint_error' }));
    await vi.waitFor(() =>
      expect(t.seen.events.map((e) => e.type)).toEqual(['hinting', 'hint_error']),
    );
    stop();
    t.session.close();
  });

  it('does not switch to an epoch published by someone who is not the GM', async () => {
    const t = await setup();
    const gm = await t.mk('gm', 'gm');
    const mallory = await t.mk('mallory', 'player');
    const stop = followGm(t.session, t.verifier, isGm, t.on);

    const e1 = gmBroadcast(t.relay, 1);
    e1.snapshot(await gm.frame(snapshotBody(1, 0)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1]));

    // 偽の GM が epoch 2（次の epoch、announce なしでも探される）と epoch 3 に publish する
    const fake2 = gmBroadcast(t.relay, 2);
    fake2.snapshot(await mallory.frame(snapshotBody(2, 9)));
    const fake3 = gmBroadcast(t.relay, 3);
    fake3.snapshot(await mallory.frame(snapshotBody(3, 9)));
    fake3.event(
      await mallory.frame({ epoch: 3, seq: 10, type: 'player_turn', round: 1, limitSec: 60 }),
    );
    // 最初の Track not found から 500ms 後のやり直しまで待つ
    await sleep(1200);
    expect(t.seen.epochs).toEqual([1]);
    expect(t.seen.snapshots.map((s) => s.seq)).toEqual([0]);
    expect(t.seen.events).toEqual([]);
    // gm/2 は Track not found の後のやり直しで、gm/3 は announce で購読していた
    const subs = t.relay.connections.flatMap((c) => c.subscribes);
    expect(subs.filter((x) => x.path === 'gm/2').length).toBeGreaterThan(1);
    expect(subs.some((x) => x.path === 'gm/3')).toBe(true);

    // epoch 1 の GM のイベントは引き続き届く
    e1.event(await gm.frame({ epoch: 1, seq: 1, type: 'hinting' }));
    await vi.waitFor(() => expect(t.seen.events.map((e) => e.type)).toEqual(['hinting']));
    stop();
    t.session.close();
  });

  it('does not switch when a stolen GM frame is replayed on another epoch', async () => {
    const t = await setup();
    const gm = await t.mk('gm', 'gm');
    const stop = followGm(t.session, t.verifier, isGm, t.on);

    const e1 = gmBroadcast(t.relay, 1);
    const snap = await gm.frame(snapshotBody(1, 0));
    e1.snapshot(snap);
    const turn = await gm.frame({ epoch: 1, seq: 1, type: 'player_turn', round: 1, limitSec: 60 });
    e1.event(turn);
    await vi.waitFor(() => expect(t.seen.events).toHaveLength(1));

    // 本物の GM の署名付きフレームをそのまま gm/2 と gm/3 に流し直す
    const replay2 = gmBroadcast(t.relay, 2);
    replay2.snapshot(snap);
    replay2.event(turn);
    const replay3 = gmBroadcast(t.relay, 3);
    replay3.snapshot(snap);
    await sleep(1200);
    expect(t.relay.connections.flatMap((c) => c.subscribes).some((x) => x.path === 'gm/2')).toBe(
      true,
    );
    expect(t.seen.epochs).toEqual([1]);
    expect(t.seen.events).toHaveLength(1);
    expect(t.seen.snapshots).toHaveLength(1);
    stop();
    t.session.close();
  });

  it('does not deliver an event twice when the events track is subscribed again', async () => {
    const t = await setup();
    const gm = await t.mk('gm', 'gm');
    const stop = followGm(t.session, t.verifier, isGm, t.on);

    const e1 = gmBroadcast(t.relay, 1);
    e1.snapshot(await gm.frame(snapshotBody(1, 0)));
    e1.event(await gm.frame({ epoch: 1, seq: 1, type: 'hinting' }));
    e1.event(await gm.frame({ epoch: 1, seq: 2, type: 'hint_error' }));
    await vi.waitFor(() => expect(t.seen.events.map((e) => e.seq)).toEqual([1, 2]));

    // 予算を使い切らせて張り直させる。新しい接続で開いたグループが最初から届き直す
    while (t.relay.connections.length < 2) {
      t.session.subscribe('dummy', 'track', () => {}, { blind: true });
      await flush();
    }
    await vi.waitFor(() => expect(t.relay.connections[1].live.size).toBeGreaterThanOrEqual(2));
    e1.event(await gm.frame({ epoch: 1, seq: 3, type: 'hinting' }));
    await vi.waitFor(() => expect(t.seen.events.map((e) => e.seq)).toEqual([1, 2, 3]));
    await sleep(50);
    expect(t.seen.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(t.seen.snapshots.map((s) => s.seq)).toEqual([0]);
    stop();
    t.session.close();
  });

  it('keeps at most two watches even when ten epochs are announced', async () => {
    const t = await setup();
    const gm = await t.mk('gm', 'gm');
    const stop = followGm(t.session, t.verifier, isGm, t.on);
    const e1 = gmBroadcast(t.relay, 1);
    e1.snapshot(await gm.frame(snapshotBody(1, 0)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1]));

    // 何も書かない broadcast を 10 個 announce させる（購読は生きたまま残る）
    for (let n = 2; n <= 11; n++) gmBroadcast(t.relay, n);
    await sleep(700); // gm/2 は乗り換え直後に Track not found になっているので、やり直しを待つ
    const live = () =>
      [...t.relay.connections.at(-1)!.live].map((x) => `${x.path}#${x.track}`).sort();
    // 乗り換え済みの gm/1 の 2 本 + 乗り換え先を探す 2 本（current + 1 と announce の最大）
    expect(live()).toEqual(['gm/1#events', 'gm/1#state', 'gm/11#state', 'gm/2#state']);
    stop();
    t.session.close();
  });

  it('accepts the new GM after a transfer even though its seq starts over', async () => {
    const t = await setup();
    const a = await t.mk('gm', 'gm');
    const b = await t.mk('bob', 'gm');
    let gmPid = 'gm';
    const stop = followGm(t.session, t.verifier, (pid) => pid === gmPid, t.on);

    const e1 = gmBroadcast(t.relay, 1);
    e1.snapshot(await a.frame(snapshotBody(1, 50)));
    e1.event(await a.frame({ epoch: 1, seq: 50, type: 'hinting' }));
    await vi.waitFor(() => expect(t.seen.events).toHaveLength(1));

    // 交代：以後は bob が GM。bob は seq を 0 から数え、epoch 2 で publish する
    gmPid = 'bob';
    const e2 = gmBroadcast(t.relay, 2);
    e2.snapshot(await b.frame({ ...snapshotBody(2, 1), gmPid: 'bob' }));
    e2.event(await b.frame({ epoch: 2, seq: 1, type: 'hint_error' }));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1, 2]), { timeout: 3000 });
    await vi.waitFor(() =>
      expect(t.seen.events.map((e) => [e.pid, e.seq])).toEqual([
        ['gm', 50],
        ['bob', 1],
      ]),
    );
    expect(t.seen.snapshots.map((s) => [s.pid, s.seq])).toEqual([
      ['gm', 50],
      ['bob', 1],
    ]);
    stop();
    t.session.close();
  });

  it('frees the announced watch when its first frame fails verification', async () => {
    const t = await setup();
    const gm = await t.mk('gm', 'gm');
    const mallory = await t.mk('mallory', 'player');
    const stop = followGm(t.session, t.verifier, isGm, t.on);
    const e1 = gmBroadcast(t.relay, 1);
    e1.snapshot(await gm.frame(snapshotBody(1, 0)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1]));

    // 偽の gm/999999 が announce の枠を取る
    const fake = gmBroadcast(t.relay, 999999);
    fake.snapshot(await mallory.frame(snapshotBody(999999, 0)));
    await sleep(50);
    // その後に本物の GM が gm/5 で publish すれば、乗り換えられる
    const e5 = gmBroadcast(t.relay, 5);
    e5.snapshot(await gm.frame(snapshotBody(5, 1)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1, 5]));
    stop();
    t.session.close();
  });

  it('ignores announced paths whose epoch is empty or not a number', async () => {
    const t = await setup();
    const stop = followGm(t.session, t.verifier, isGm, t.on);
    for (const p of ['gm/', 'gm/abc', 'gm/1x', 'gm/-1', 'gm/0']) t.relay.announce(p, true);
    await flush();
    const paths = t.relay.connections[0].subscribes.map((x) => x.path);
    expect(paths.filter((p) => p !== 'gm/1')).toEqual([]);
    stop();
    t.session.close();
  });

  it('finds the GM on epoch 3 without any announce by probing epochs 1 to 5', async () => {
    const t = await setup({ dropAnnounce: true });
    const gm = await t.mk('gm', 'gm');
    const e3 = gmBroadcast(t.relay, 3);
    e3.snapshot(await gm.frame(snapshotBody(3, 7)));
    const stop = followGm(t.session, t.verifier, isGm, t.on);
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([3]), { timeout: 5000 });
    await vi.waitFor(() => expect(t.seen.snapshots.map((s) => s.seq)).toEqual([7]));
    const probed = t.relay.connections[0].subscribes
      .filter((x) => x.track === 'state')
      .map((x) => x.path);
    expect(probed.slice(0, 3)).toEqual(['gm/1', 'gm/2', 'gm/3']);
    expect(t.relay.connections[0].subscribes.every((x) => !x.announced)).toBe(true);
    stop();
    t.session.close();
  });

  it('drops frames with a broken signature, invalid JSON, or an invalid schema', async () => {
    const t = await setup();
    const gm = await t.mk('gm', 'gm');
    const stop = followGm(t.session, t.verifier, isGm, t.on);

    const e1 = gmBroadcast(t.relay, 1);
    e1.snapshot(await gm.frame(snapshotBody(1, 0)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1]));

    const good = JSON.parse(
      new TextDecoder().decode(await gm.frame({ epoch: 1, seq: 1, type: 'hinting' })),
    );
    e1.event(enc({ ...good, body: { ...good.body, type: 'dissolved' } })); // 署名が合わない
    e1.event(new TextEncoder().encode('{not json'));
    e1.event(await gm.frame({ epoch: 1, seq: 2, type: 'no_such_event' })); // スキーマに合わない
    e1.event(await gm.frame({ seq: 3, type: 'hint_error' })); // epoch が無い
    e1.event(await gm.frame({ epoch: 1, seq: 4, type: 'hint_error' }));
    await vi.waitFor(() => expect(t.seen.events.map((e) => e.seq)).toEqual([4]));
    expect(t.seen.events[0].type).toBe('hint_error');
    stop();
    t.session.close();
  });

  it('stop() unsubscribes everything', async () => {
    const t = await setup();
    const gm = await t.mk('gm', 'gm');
    const stop = followGm(t.session, t.verifier, isGm, t.on);
    const e1 = gmBroadcast(t.relay, 1);
    e1.snapshot(await gm.frame(snapshotBody(1, 0)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1]));
    stop();
    e1.event(await gm.frame({ epoch: 1, seq: 1, type: 'hinting' }));
    await sleep(50);
    expect(t.seen.events).toEqual([]);
    expect(t.relay.connections[0].live.size).toBe(0);
    t.session.close();
  });
});

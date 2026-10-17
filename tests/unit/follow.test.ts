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

async function setup() {
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

const snapshotBody = (seq: number) => ({
  seq,
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

describe('followGm', () => {
  it('follows epoch 1 by announce, then subscribes epoch 2 without announce and switches', async () => {
    const t = await setup();
    const gm = await t.mk('gm', 'gm');
    const stop = followGm(t.session, t.verifier, (pid) => pid === 'gm', t.on);

    const e1 = gmBroadcast(t.relay, 1);
    e1.snapshot(await gm.frame(snapshotBody(0)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1]));
    await vi.waitFor(() => expect(t.seen.snapshots).toHaveLength(1));
    e1.event(await gm.frame({ seq: 1, type: 'hinting' }));
    await vi.waitFor(() => expect(t.seen.events.map((e) => e.type)).toEqual(['hinting']));

    // GM が再接続して epoch 2 で publish するが、announce は届かない
    t.relay.dropAnnounce = true;
    e1.conn.close();
    const e2 = gmBroadcast(t.relay, 2);
    e2.snapshot(await gm.frame(snapshotBody(2)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1, 2]), { timeout: 3000 });
    await vi.waitFor(() => expect(t.seen.snapshots.map((s) => s.seq)).toEqual([0, 2]));
    // epoch 2 の購読は announce を待たない
    const probes = t.relay.connections.flatMap((c) => c.subscribes).filter((x) => x.path === 'gm/2');
    expect(probes.every((x) => !x.announced)).toBe(true);

    e2.event(await gm.frame({ seq: 3, type: 'hint_error' }));
    await vi.waitFor(() => expect(t.seen.events.map((e) => e.type)).toEqual(['hinting', 'hint_error']));
    stop();
    t.session.close();
  });

  it('does not switch to an epoch published by someone who is not the GM', async () => {
    const t = await setup();
    const gm = await t.mk('gm', 'gm');
    const mallory = await t.mk('mallory', 'player');
    const stop = followGm(t.session, t.verifier, (pid) => pid === 'gm', t.on);

    const e1 = gmBroadcast(t.relay, 1);
    e1.snapshot(await gm.frame(snapshotBody(0)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1]));

    // 偽の GM が epoch 2（次の epoch、announce なしでも探される）と epoch 3 に publish する
    const fake2 = gmBroadcast(t.relay, 2);
    fake2.snapshot(await mallory.frame(snapshotBody(9)));
    const fake3 = gmBroadcast(t.relay, 3);
    fake3.snapshot(await mallory.frame(snapshotBody(9)));
    fake3.event(await mallory.frame({ seq: 10, type: 'player_turn', round: 1, limitSec: 60 }));
    // 最初の Track not found から 500ms 後のやり直しまで待つ
    await new Promise((r) => setTimeout(r, 1200));
    expect(t.seen.epochs).toEqual([1]);
    expect(t.seen.snapshots.map((s) => s.seq)).toEqual([0]);
    expect(t.seen.events).toEqual([]);
    // gm/2 は Track not found の後のやり直しで、gm/3 は announce で購読していた
    const subs = t.relay.connections.flatMap((c) => c.subscribes);
    expect(subs.filter((x) => x.path === 'gm/2').length).toBeGreaterThan(1);
    expect(subs.some((x) => x.path === 'gm/3')).toBe(true);

    // epoch 1 の GM のイベントは引き続き届く
    e1.event(await gm.frame({ seq: 1, type: 'hinting' }));
    await vi.waitFor(() => expect(t.seen.events.map((e) => e.type)).toEqual(['hinting']));
    stop();
    t.session.close();
  });

  it('drops frames with a broken signature, invalid JSON, or an invalid schema', async () => {
    const t = await setup();
    const gm = await t.mk('gm', 'gm');
    const stop = followGm(t.session, t.verifier, (pid) => pid === 'gm', t.on);

    const e1 = gmBroadcast(t.relay, 1);
    e1.snapshot(await gm.frame(snapshotBody(0)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1]));

    const good = JSON.parse(new TextDecoder().decode(await gm.frame({ seq: 1, type: 'hinting' })));
    e1.event(enc({ ...good, body: { ...good.body, type: 'dissolved' } })); // 署名が合わない
    e1.event(new TextEncoder().encode('{not json'));
    e1.event(await gm.frame({ seq: 2, type: 'no_such_event' })); // スキーマに合わない
    e1.event(await gm.frame({ seq: 3, type: 'hint_error' }));
    await vi.waitFor(() => expect(t.seen.events.map((e) => e.seq)).toEqual([3]));
    expect(t.seen.events[0].type).toBe('hint_error');
    stop();
    t.session.close();
  });

  it('stop() unsubscribes everything', async () => {
    const t = await setup();
    const gm = await t.mk('gm', 'gm');
    const stop = followGm(t.session, t.verifier, (pid) => pid === 'gm', t.on);
    const e1 = gmBroadcast(t.relay, 1);
    e1.snapshot(await gm.frame(snapshotBody(0)));
    await vi.waitFor(() => expect(t.seen.epochs).toEqual([1]));
    stop();
    e1.event(await gm.frame({ seq: 1, type: 'hinting' }));
    await flush();
    await new Promise((r) => setTimeout(r, 50));
    expect(t.seen.events).toEqual([]);
    t.session.close();
  });
});

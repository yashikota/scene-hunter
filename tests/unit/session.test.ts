import { describe, expect, it, vi } from 'vite-plus/test';
import { GmInbox } from '../../src/client/moq/gmInbox';
import { MoqSession } from '../../src/client/moq/session';
import type { PlayerEvent } from '../../src/shared/protocol';
import { FakeRelay, flush } from './fakeMoq';
import { enc, makeIdentities } from './moqKeys';

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('MoqSession', () => {
  it('counts the announce subscription, every subscribe, and every published broadcast/track', async () => {
    const relay = new FakeRelay();
    const s = new MoqSession('https://relay/x', relay.connector);
    await s.start();
    expect(s.requestCount).toBe(1);
    s.subscribe('a', 'events', () => {});
    expect(s.requestCount).toBe(2);
    s.publish('p/me', 'events');
    expect(s.requestCount).toBe(4); // broadcast の announce + track
    s.publish('p/me', 'state');
    expect(s.requestCount).toBe(5); // 同じ broadcast なので track だけ
    s.close();
  });

  it('reconnects when the budget is reached and redoes live subscriptions and publishes', async () => {
    const relay = new FakeRelay();
    const gm = relay.connect();
    const gmEvents = gm.publish('gm/1', 'events').appendGroup();

    const s = new MoqSession('https://relay/x', relay.connector);
    await s.start();
    const w = s.publish('p/me', 'events'); // 3 件（合計 3）
    w.write(bytes('before'));

    // 生きている購読を 3 本
    const got: string[][] = [[], [], []];
    for (let i = 0; i < 3; i++) s.subscribe('gm/1', 'events', (b) => got[i].push(text(b)));
    // 存在しないパスへの購読（すぐ終わる）を 33 本で予算 40 に達する
    const ended: unknown[] = [];
    for (let i = 0; i < 34; i++) {
      s.subscribe(`gm/${100 + i}`, 'state', () => {}, { blind: true, onEnd: (e) => ended.push(e) });
      await flush();
      if (i === 32) expect(s.requestCount).toBe(39);
    }
    // 1 + 3 + 3 + 34 = 41 件目の購読（全体で 41 回目の購読）で張り直す
    expect(s.requestCount).toBe(40);
    expect(relay.connections).toHaveLength(1);
    s.subscribe('gm/200', 'state', () => {}, { blind: true });
    await flush();
    await flush();

    expect(relay.connections).toHaveLength(2);
    const [c1, c2] = relay.connections;
    expect(c1.closed).toBe(true);
    expect(c1.subscribes).toHaveLength(37);
    // 新しい接続で、生きている 3 本と待っていた 1 本を購読し、publish をやり直す
    expect(c2.subscribes.map((x) => x.path)).toEqual(['gm/1', 'gm/1', 'gm/1', 'gm/200']);
    expect(c2.publishes).toEqual([{ path: 'p/me', track: 'events' }]);
    expect(s.requestCount).toBe(1 + 2 + 4);
    expect(ended).toHaveLength(34);

    // 新しい接続でも受信できる
    gmEvents.writeFrame(bytes('hello'));
    expect(got).toEqual([['hello'], ['hello'], ['hello']]);
    s.close();
  });

  it('write appends to one open group; snapshot writes a single-frame group; replays the last snapshot after reconnect', async () => {
    const relay = new FakeRelay();
    const s = new MoqSession('https://relay/x', relay.connector, 6);
    await s.start();
    const events = s.publish('gm/1', 'events');
    const state = s.publish('gm/1', 'state'); // 1 + 2 + 1 = 4
    events.write(bytes('e1'));
    events.write(bytes('e2'));
    state.snapshot(bytes('s1'));
    state.snapshot(bytes('s2'));
    expect(relay.tracks.get('gm/1#events')!.groups).toEqual([[bytes('e1'), bytes('e2')]]);
    expect(relay.tracks.get('gm/1#state')!.groups).toEqual([[bytes('s1')], [bytes('s2')]]);

    s.subscribe('x', 'y', () => {});
    s.subscribe('x', 'y', () => {}); // 6 件
    s.subscribe('x', 'y', () => {}); // 張り直し
    events.write(bytes('e3')); // 張り直し中の書き込みは貯めておく
    await flush();
    await flush();
    expect(relay.connections).toHaveLength(2);
    expect(relay.tracks.get('gm/1#state')!.groups).toEqual([[bytes('s2')]]);
    expect(relay.tracks.get('gm/1#events')!.groups).toEqual([[bytes('e3')]]);
    s.close();
  });

  it('unsubscribed and ended subscriptions are not redone', async () => {
    const relay = new FakeRelay();
    relay.connect().publish('a', 't');
    const s = new MoqSession('https://relay/x', relay.connector, 4);
    await s.start();
    const off = s.subscribe('a', 't', () => {});
    s.subscribe('missing', 't', () => {});
    await flush();
    off();
    s.subscribe('a', 't', () => {}); // 4 件
    s.subscribe('a', 't', () => {}); // 張り直し
    await flush();
    await flush();
    expect(relay.connections[1].subscribes.map((x) => x.path)).toEqual(['a', 'a']);
    s.close();
  });
});

describe('MoqSession の後始末と異常系', () => {
  it('subscribe and publish after close do nothing', async () => {
    const relay = new FakeRelay();
    const s = new MoqSession('https://relay/x', relay.connector);
    await s.start();
    s.close();
    const off = s.subscribe('a', 't', () => {});
    const w = s.publish('p/me', 'events');
    w.write(bytes('x'));
    w.snapshot(bytes('y'));
    off();
    expect(relay.connections[0].subscribes).toEqual([]);
    expect(relay.connections[0].publishes).toEqual([]);
  });

  it('gives up connecting after 10 seconds', async () => {
    vi.useFakeTimers();
    try {
      const s = new MoqSession('https://relay/x', { connect: () => new Promise(() => {}) });
      const started = s.start();
      const assertion = expect(started).rejects.toThrow('タイムアウト');
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns when the live requests alone exceed the budget after reconnecting', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const relay = new FakeRelay();
      relay.connect().publish('a', 't');
      const s = new MoqSession('https://relay/x', relay.connector, 3);
      await s.start();
      s.subscribe('a', 't', () => {});
      s.subscribe('a', 't', () => {}); // 3 件
      s.subscribe('a', 't', () => {}); // 張り直し。生きた購読 3 本 + announce で 4 件
      await flush();
      await flush();
      expect(warn).toHaveBeenCalledTimes(1);
      s.close();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('GmInbox', () => {
  it('opens a separate session for every 20 players', async () => {
    const relay = new FakeRelay();
    const inbox = new GmInbox(
      'https://relay/x',
      relay.connector,
      (await makeIdentities()).verifier(),
    );
    for (let i = 0; i < 21; i++) inbox.add(`p${i}`, () => {});
    await flush();
    await flush();
    expect(relay.connections).toHaveLength(2);
    expect(relay.connections[0].subscribes).toHaveLength(20);
    expect(relay.connections[1].subscribes.map((x) => x.path)).toEqual(['p/p20']);
    inbox.close();
  });

  it('delivers only verified player events whose seq increased', async () => {
    const ids = await makeIdentities();
    const alice = await ids.mk('alice', 'player');
    const relay = new FakeRelay();
    const track = relay.connect().publish('p/alice', 'events').appendGroup();
    const inbox = new GmInbox('https://relay/x', relay.connector, ids.verifier());
    const got: PlayerEvent[] = [];
    inbox.add('alice', (e) => got.push(e));
    await flush();
    await flush();
    for (const seq of [1, 1, 2, 0, 3]) track.writeFrame(await alice.frame({ seq, type: 'resync' }));
    track.writeFrame(await alice.frame({ seq: 4, type: 'no_such_event' })); // スキーマに合わない
    await vi.waitFor(() => expect(got.map((e) => e.seq)).toEqual([1, 2, 3]));
    await new Promise((r) => setTimeout(r, 20));
    expect(got.map((e) => e.seq)).toEqual([1, 2, 3]);
    inbox.close();
  });

  it('a forged frame with a high seq does not block the real player', async () => {
    const ids = await makeIdentities();
    const alice = await ids.mk('alice', 'player');
    const mallory = await ids.mk('mallory', 'player');
    const relay = new FakeRelay();
    const track = relay.connect().publish('p/alice', 'events').appendGroup();
    const inbox = new GmInbox('https://relay/x', relay.connector, ids.verifier());
    const got: PlayerEvent[] = [];
    inbox.add('alice', (e) => got.push(e));
    await flush();
    await flush();
    // 署名の無いフレーム、mallory が自分の鍵で alice を名乗るフレーム、mallory 本人のフレーム
    track.writeFrame(enc({ body: { pid: 'alice', seq: 1_000_000, type: 'resync' }, sig: 'x' }));
    const forged = JSON.parse(
      new TextDecoder().decode(await mallory.frame({ seq: 999_999, type: 'resync' })),
    );
    track.writeFrame(enc({ ...forged, body: { ...forged.body, pid: 'alice' } }));
    track.writeFrame(await mallory.frame({ seq: 999_998, type: 'resync' }));
    track.writeFrame(await alice.frame({ seq: 1, type: 'join', name: 'alice' }));
    await vi.waitFor(() =>
      expect(got).toEqual([{ pid: 'alice', seq: 1, type: 'join', name: 'alice' }]),
    );
    inbox.close();
  });

  it('backs off resubscribing to a player who has not published yet up to 10 seconds', async () => {
    const verifier = (await makeIdentities()).verifier();
    vi.useFakeTimers();
    try {
      const relay = new FakeRelay();
      const inbox = new GmInbox('https://relay/x', relay.connector, verifier);
      inbox.add('ghost', () => {});
      const count = () => relay.connections[0]?.subscribes.length ?? 0;
      await vi.advanceTimersByTimeAsync(0);
      expect(count()).toBe(1);
      // 0.5 + 1 + 2 + 4 + 8 + 10 + 10 秒
      await vi.advanceTimersByTimeAsync(35_500);
      expect(count()).toBe(8);
      await vi.advanceTimersByTimeAsync(9_000);
      expect(count()).toBe(8);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(count()).toBe(9);
      inbox.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops delivering after remove', async () => {
    const ids = await makeIdentities();
    const alice = await ids.mk('alice', 'player');
    const relay = new FakeRelay();
    const track = relay.connect().publish('p/alice', 'events').appendGroup();
    const inbox = new GmInbox('https://relay/x', relay.connector, ids.verifier());
    const got: number[] = [];
    inbox.add('alice', (e) => got.push(e.seq));
    await flush();
    await flush();
    track.writeFrame(await alice.frame({ seq: 1, type: 'resync' }));
    await vi.waitFor(() => expect(got).toEqual([1]));
    const late = await alice.frame({ seq: 2, type: 'resync' });
    track.writeFrame(late);
    inbox.remove('alice'); // 検証中のフレームも渡さない
    track.writeFrame(await alice.frame({ seq: 3, type: 'resync' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(got).toEqual([1]);
    inbox.close();
  });
});

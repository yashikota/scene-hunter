import { describe, expect, it } from 'vite-plus/test';
import { GmInbox } from '../../src/client/moq/gmInbox';
import { MoqSession } from '../../src/client/moq/session';
import { FakeRelay, flush } from './fakeMoq';

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

describe('GmInbox', () => {
  it('opens a separate session for every 35 players', async () => {
    const relay = new FakeRelay();
    const inbox = new GmInbox('https://relay/x', relay.connector);
    for (let i = 0; i < 36; i++) inbox.add(`p${i}`, () => {});
    await flush();
    await flush();
    expect(relay.connections).toHaveLength(2);
    expect(relay.connections[0].subscribes).toHaveLength(35);
    expect(relay.connections[1].subscribes.map((x) => x.path)).toEqual(['p/p35']);
    inbox.close();
  });

  it('delivers player frames and stops after remove', async () => {
    const relay = new FakeRelay();
    const alice = relay.connect().publish('p/alice', 'events').appendGroup();
    const inbox = new GmInbox('https://relay/x', relay.connector);
    const got: string[] = [];
    inbox.add('alice', (b) => got.push(text(b)));
    await flush();
    await flush();
    alice.writeFrame(bytes('join'));
    inbox.remove('alice');
    alice.writeFrame(bytes('late'));
    expect(got).toEqual(['join']);
    inbox.close();
  });
});

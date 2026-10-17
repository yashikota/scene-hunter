// テスト用の偽の MoQ Relay。ネットワークを使わずに MoqConnector を差し替える。
// - 最初に publish した接続がパスを持つ（後から同じパスを publish しても無視される）
// - 新しく購読した人には最新のグループのフレームだけが届く
// - publish されていない Track を購読すると `Track not found` で終わる
import type { MoqConnection, MoqConnector, MoqTrackWriter, TrackSink } from '../../src/client/moq/session';

interface FakeTrack {
  owner: FakeConnection;
  groups: Uint8Array[][];
  subs: Set<TrackSink>;
}

export class FakeRelay {
  /** connector 経由で張られた接続（テスト対象の接続）。 */
  readonly connections: FakeConnection[] = [];
  /** true にすると announce を誰にも配らない（Relay の配り損ねの再現）。 */
  dropAnnounce = false;
  readonly tracks = new Map<string, FakeTrack>();
  readonly all = new Set<FakeConnection>();

  readonly connector: MoqConnector = {
    connect: async () => {
      await Promise.resolve();
      const c = this.connect();
      this.connections.push(c);
      return c;
    },
  };

  /** テスト対象の外側（GM 役など）の接続。connections には入らない。 */
  connect(): FakeConnection {
    const c = new FakeConnection(this);
    this.all.add(c);
    return c;
  }

  announce(path: string, active: boolean) {
    if (this.dropAnnounce) return;
    for (const c of this.all) for (const fn of c.listeners) fn(path, active);
  }
}

export class FakeConnection implements MoqConnection {
  readonly subscribes: { path: string; track: string; announced: boolean }[] = [];
  readonly publishes: { path: string; track: string }[] = [];
  readonly listeners = new Set<(path: string, active: boolean) => void>();
  /** いま生きている購読（Track が見つかり、まだ外されていないもの）。 */
  readonly live = new Set<{ path: string; track: string }>();
  closed = false;

  constructor(private readonly relay: FakeRelay) {}

  publish(path: string, track: string): MoqTrackWriter {
    this.publishes.push({ path, track });
    const key = `${path}#${track}`;
    const taken = this.relay.tracks.get(key);
    const t: FakeTrack = { owner: this, groups: [], subs: new Set() };
    const fresh = ![...this.relay.tracks.keys()].some((k) => k.startsWith(`${path}#`));
    if (!taken) this.relay.tracks.set(key, t);
    if (!taken && fresh) this.relay.announce(path, true);
    return {
      appendGroup: () => {
        const g: Uint8Array[] = [];
        t.groups.push(g);
        return {
          writeFrame: (bytes) => {
            g.push(bytes);
            for (const s of t.subs) s.frame(bytes);
          },
          close: () => {},
        };
      },
    };
  }

  subscribe(path: string, track: string, opts: { announced: boolean }, sink: TrackSink): () => void {
    this.subscribes.push({ path, track, announced: opts.announced });
    let t: FakeTrack | undefined;
    let live = true;
    const entry = { path, track };
    const wrapped: TrackSink = {
      frame: (b) => sink.frame(b),
      end: (e) => {
        this.live.delete(entry);
        sink.end(e);
      },
    };
    queueMicrotask(() => {
      if (!live) return;
      t = this.relay.tracks.get(`${path}#${track}`);
      if (!t) return sink.end(new Error('Track not found'));
      this.live.add(entry);
      for (const f of t.groups.at(-1) ?? []) sink.frame(f);
      t.subs.add(wrapped);
    });
    return () => {
      live = false;
      this.live.delete(entry);
      t?.subs.delete(wrapped);
    };
  }

  announced(onPath: (path: string, active: boolean) => void): () => void {
    this.listeners.add(onPath);
    return () => this.listeners.delete(onPath);
  }

  close(): void {
    this.closed = true;
    this.relay.all.delete(this);
    for (const [key, t] of this.relay.tracks) {
      if (t.owner !== this) continue;
      this.relay.tracks.delete(key);
      for (const s of t.subs) s.end(new Error('track ended'));
    }
  }
}

/** queueMicrotask と setTimeout(0) をまとめて流す。 */
export const flush = () => new Promise((r) => setTimeout(r, 0));

// テスト用の偽の MoQ Relay。ネットワークを使わずに MoqConnector を差し替える。
// - 最初に publish した接続がパスを持つ（後から同じパスを publish しても無視される）
// - 新しく購読した人には最新のグループのフレームだけが届く
// - publish されていない Track を購読すると `Track not found` で終わる
import type {
  MoqConnection,
  MoqConnector,
  MoqTrackWriter,
  TrackSink,
} from "../../src/client/moq/session";

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

  /** 設定している間は、connector の接続をこの Promise が解けるまで待たせる（つながらない間の再現）。 */
  gate?: Promise<void>;

  readonly connector: MoqConnector = {
    connect: async () => {
      await Promise.resolve();
      if (this.gate) await this.gate;
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
  readonly subscribes: { path: string; track: string; announced: boolean; maxAgeMs?: number }[] =
    [];
  readonly publishes: { path: string; track: string }[] = [];
  readonly listeners = new Set<(path: string, active: boolean) => void>();
  /** いま生きている購読（Track が見つかり、まだ外されていないもの）。 */
  readonly live = new Set<{ path: string; track: string }>();
  closed = false;
  readonly #onClose: Array<(error?: unknown) => void> = [];

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

  subscribe(
    path: string,
    track: string,
    opts: { announced: boolean; maxAgeMs?: number },
    sink: TrackSink,
  ): () => void {
    this.subscribes.push({ path, track, announced: opts.announced, maxAgeMs: opts.maxAgeMs });
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
      if (!t) return sink.end(new Error("Track not found"));
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

  onClose(cb: (error?: unknown) => void): void {
    this.#onClose.push(cb);
  }

  close(): void {
    this.#shut();
  }

  /** 相手側から接続が切れた（回線の断絶や Relay の切断）ことにする。 */
  drop(error: unknown = new Error("connection lost")): void {
    this.#shut(error);
  }

  #shut(error?: unknown): void {
    if (this.closed) return;
    this.closed = true;
    this.relay.all.delete(this);
    for (const [key, t] of this.relay.tracks) {
      if (t.owner !== this) continue;
      this.relay.tracks.delete(key);
      for (const s of t.subs) s.end(new Error("track ended"));
    }
    // 本物（Established.closed）と同じく、閉じたことは後から知らせる。
    for (const cb of this.#onClose.splice(0)) queueMicrotask(() => cb(error));
  }
}

/** queueMicrotask と setTimeout(0) をまとめて流す。 */
export const flush = () => new Promise((r) => setTimeout(r, 0));

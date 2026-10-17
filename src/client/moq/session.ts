import * as Moq from '@moq/net';

// MoQ の 1 本の接続（WebTransport セッション）を、リクエストの予算つきで包む。
// Cloudflare の Relay は 1 セッションで 50 件までしかリクエストを受け付けない（poc/moq-verify/README.md）。
// 自分で数えて budget に達したら、新しい接続を張り、生きている購読と publish をすべてやり直す。

/** 1 つの接続の上での操作。本番は @moq/net、テストでは偽物。 */
export interface MoqConnection {
  /** パスの broadcast を announce し（まだなら）、Track を作る。 */
  publish(path: string, track: string): MoqTrackWriter;
  /** announced が false なら announce を待たずに購読する。 */
  subscribe(path: string, track: string, opts: { announced: boolean }, sink: TrackSink): () => void;
  /** announce の購読は接続を張ったときに 1 件だけ出す。ここでは受け取り口を足すだけ。 */
  announced(onPath: (path: string, active: boolean) => void): () => void;
  close(): void;
}

export interface MoqTrackWriter {
  appendGroup(): MoqGroupWriter;
}

export interface MoqGroupWriter {
  writeFrame(bytes: Uint8Array): void;
  close(): void;
}

export interface TrackSink {
  frame(bytes: Uint8Array): void;
  /** Track が終わった（publisher が去った、`Track not found` など）。以後 frame は来ない。 */
  end(error?: unknown): void;
}

export interface MoqConnector {
  connect(url: string): Promise<MoqConnection>;
}

export interface FrameWriter {
  /** 開いているグループに追記する（無ければ開く）。 */
  write(bytes: Uint8Array): void;
  /** 1 グループ 1 フレームで書く。開いていたグループは閉じる。 */
  snapshot(bytes: Uint8Array): void;
}

export interface SubscribeOptions {
  /** announce を待たずに購読する。 */
  blind?: boolean;
  /** Track が終わったときに呼ぶ。この購読は終わったものとして扱い、張り直しでもやり直さない。 */
  onEnd?: (error?: unknown) => void;
}

interface Sub {
  path: string;
  track: string;
  onFrame: (bytes: Uint8Array) => void;
  opts: SubscribeOptions;
  detach?: () => void;
}

interface Pub {
  path: string;
  track: string;
  writer?: MoqTrackWriter;
  group?: MoqGroupWriter;
  /** 接続が無い間に write されたフレーム。 */
  pending: Uint8Array[];
  /** 張り直した接続で書き直す、最後のスナップショット。 */
  lastSnapshot?: Uint8Array;
}

const RETRY_MIN_MS = 500;
const RETRY_MAX_MS = 5000;

export class MoqSession {
  #conn?: MoqConnection;
  #opening?: Promise<void>;
  #requests = 0;
  #closed = false;
  readonly #subs = new Set<Sub>();
  readonly #pubs: Pub[] = [];
  readonly #announceListeners = new Map<(path: string, active: boolean) => void, (() => void) | undefined>();
  readonly #announcedPaths = new Set<string>();

  constructor(
    private readonly url: string,
    private readonly connector: MoqConnector,
    private readonly budget = 40,
  ) {}

  /** いまの接続で使ったリクエストの数。 */
  get requestCount(): number {
    return this.#requests;
  }

  start(): Promise<void> {
    if (this.#conn) return Promise.resolve();
    this.#opening ??= this.connector.connect(this.url).then(
      (conn) => this.#install(conn),
      (e: unknown) => {
        this.#opening = undefined;
        throw e;
      },
    );
    return this.#opening;
  }

  publish(path: string, track: string): FrameWriter {
    const pub: Pub = { path, track, pending: [] };
    this.#pubs.push(pub);
    if (this.#ready()) this.#attachPub(pub);
    return {
      write: (bytes) => {
        if (!pub.writer) return void pub.pending.push(bytes);
        pub.group ??= pub.writer.appendGroup();
        pub.group.writeFrame(bytes);
      },
      snapshot: (bytes) => {
        pub.lastSnapshot = bytes;
        if (pub.writer) writeSnapshot(pub, bytes);
      },
    };
  }

  subscribe(
    path: string,
    track: string,
    onFrame: (bytes: Uint8Array) => void,
    opts: SubscribeOptions = {},
  ): () => void {
    const sub: Sub = { path, track, onFrame, opts };
    this.#subs.add(sub);
    if (this.#ready()) this.#attachSub(sub);
    return () => {
      if (!this.#subs.delete(sub)) return;
      sub.detach?.();
      sub.detach = undefined;
    };
  }

  announced(onPath: (path: string, active: boolean) => void): () => void {
    this.#announceListeners.set(onPath, this.#conn && !this.#opening ? this.#conn.announced(onPath) : undefined);
    return () => {
      this.#announceListeners.get(onPath)?.();
      this.#announceListeners.delete(onPath);
    };
  }

  close(): void {
    this.#closed = true;
    this.#detachAll();
    this.#conn?.close();
    this.#conn = undefined;
    this.#subs.clear();
    this.#pubs.length = 0;
    this.#announceListeners.clear();
  }

  /** リクエストを 1 件出してよいか。予算に達していたら張り直しを始めて false を返す。 */
  #ready(): boolean {
    if (this.#closed || !this.#conn || this.#opening) return false;
    if (this.#requests < this.budget) return true;
    this.#reconnect();
    return false;
  }

  #reconnect(): void {
    // 同じパスを 2 つの接続から publish すると先着が優先されるので、古い接続を先に閉じる。
    this.#detachAll();
    this.#conn?.close();
    this.#conn = undefined;
    this.#opening = (async () => {
      let delay = RETRY_MIN_MS;
      while (!this.#closed) {
        try {
          return this.#install(await this.connector.connect(this.url));
        } catch (e) {
          console.warn('MoQ の再接続に失敗した', e);
          await new Promise((r) => setTimeout(r, delay));
          delay = Math.min(delay * 2, RETRY_MAX_MS);
        }
      }
    })();
  }

  #install(conn: MoqConnection): void {
    if (this.#closed) return conn.close();
    this.#conn = conn;
    this.#opening = undefined;
    this.#requests = 1; // 接続と同時に出る announce の購読（SUBSCRIBE_NAMESPACE）
    this.#announcedPaths.clear();
    for (const fn of this.#announceListeners.keys()) this.#announceListeners.set(fn, conn.announced(fn));
    for (const pub of this.#pubs) this.#attachPub(pub);
    for (const sub of this.#subs) this.#attachSub(sub);
  }

  #detachAll(): void {
    for (const sub of this.#subs) {
      sub.detach?.();
      sub.detach = undefined;
    }
    for (const pub of this.#pubs) {
      pub.writer = undefined;
      pub.group = undefined;
    }
    for (const [fn, off] of this.#announceListeners) {
      off?.();
      this.#announceListeners.set(fn, undefined);
    }
  }

  #attachPub(pub: Pub): void {
    if (!this.#announcedPaths.has(pub.path)) {
      this.#announcedPaths.add(pub.path);
      this.#requests++; // broadcast の announce
    }
    this.#requests++;
    pub.writer = this.#conn!.publish(pub.path, pub.track);
    if (pub.lastSnapshot) writeSnapshot(pub, pub.lastSnapshot);
    if (pub.pending.length) {
      pub.group = pub.writer.appendGroup();
      for (const bytes of pub.pending) pub.group.writeFrame(bytes);
      pub.pending = [];
    }
  }

  #attachSub(sub: Sub): void {
    this.#requests++;
    let live = true;
    const cancel = this.#conn!.subscribe(sub.path, sub.track, { announced: !sub.opts.blind }, {
      frame: (bytes) => {
        if (live) sub.onFrame(bytes);
      },
      end: (error) => {
        if (!live) return;
        live = false;
        this.#subs.delete(sub);
        sub.detach = undefined;
        sub.opts.onEnd?.(error);
      },
    });
    if (!live) return; // subscribe の中で終わった
    sub.detach = () => {
      live = false;
      cancel();
    };
  }
}

function writeSnapshot(pub: Pub, bytes: Uint8Array): void {
  pub.group?.close();
  pub.group = undefined;
  const g = pub.writer!.appendGroup();
  g.writeFrame(bytes);
  g.close();
}

/**
 * 購読が終わったら 500ms → 2s のバックオフでやり直し続ける。
 * `Track not found`（announce 直後や、まだ publish されていないパス）と publisher の再接続を拾うため。
 */
export function keepSubscribed(
  session: MoqSession,
  path: string,
  track: string,
  onFrame: (bytes: Uint8Array) => void,
  opts: { blind?: boolean } = {},
): () => void {
  let stopped = false;
  let delay = 500;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let off: (() => void) | undefined;
  const attempt = () => {
    if (stopped) return;
    off = session.subscribe(
      path,
      track,
      (bytes) => {
        delay = 500;
        onFrame(bytes);
      },
      {
        blind: opts.blind,
        onEnd: () => {
          off = undefined;
          if (stopped) return;
          timer = setTimeout(attempt, delay);
          delay = Math.min(delay * 2, 2000);
        },
      },
    );
  };
  attempt();
  return () => {
    stopped = true;
    clearTimeout(timer);
    off?.();
  };
}

const MAX_AGE = 60_000 as Moq.Time.Milli;

/** @moq/net を使う本番の connector。WebSocket へのフォールバックはしない。 */
export function createMoqNetConnector(): MoqConnector {
  return {
    async connect(url) {
      const local = new Moq.Origin.Producer();
      const remote = new Moq.Origin.Producer();
      const conn = await Moq.Connection.connect({
        url: new URL(url),
        websocket: { enabled: false },
        publish: local.consume(),
        consume: remote,
      });
      return new MoqNetConnection(conn, local, remote);
    },
  };
}

class MoqNetConnection implements MoqConnection {
  readonly #broadcasts = new Map<string, Moq.Broadcast.Producer>();

  constructor(
    private readonly conn: Awaited<ReturnType<typeof Moq.Connection.connect>>,
    private readonly local: Moq.Origin.Producer,
    private readonly remote: Moq.Origin.Producer,
  ) {}

  publish(path: string, track: string): MoqTrackWriter {
    let b = this.#broadcasts.get(path);
    const fresh = !b;
    b ??= this.local.createBroadcast(Moq.Path.from(path));
    this.#broadcasts.set(path, b);
    const t = b.createTrack(track, { timescale: Moq.Time.Timescale.MILLI, maxAge: MAX_AGE });
    if (fresh) b.announce();
    return {
      appendGroup: () => {
        const g = t.appendGroup();
        return {
          writeFrame: (payload) => g.writeFrame({ payload, timestamp: Moq.Time.Timestamp.now() }),
          close: () => g.close(),
        };
      },
    };
  }

  subscribe(path: string, track: string, opts: { announced: boolean }, sink: TrackSink): () => void {
    let cancelled = false;
    const req = this.remote.request(Moq.Path.from(path), opts.announced ? { announced: true } : undefined);
    let sub: Moq.Track.Subscriber | undefined;
    void (async () => {
      try {
        let active = req.active.peek();
        while (!active) {
          await req.active.changed();
          if (cancelled) return;
          active = req.active.peek();
        }
        sub = active.track(track).subscribe({ priority: 0 });
        if (cancelled) return sub.close();
        for (;;) {
          const group = await sub.recvGroup();
          if (!group) throw new Error('track ended');
          for (;;) {
            const f = await group.readFrame();
            if (!f) break;
            if (cancelled) return;
            sink.frame(f.payload);
          }
        }
      } catch (e) {
        if (!cancelled) sink.end(e);
      } finally {
        sub?.close();
        req.close();
      }
    })();
    return () => {
      cancelled = true;
      sub?.close();
      req.close();
    };
  }

  announced(onPath: (path: string, active: boolean) => void): () => void {
    const stream = this.remote.announced();
    let stopped = false;
    void (async () => {
      try {
        for await (const a of stream) {
          if (stopped) return;
          onPath(String(a.prefix), a.kind !== 'retracted');
        }
      } catch {
        // 接続が閉じた
      }
    })();
    return () => {
      stopped = true;
      stream.close();
    };
  }

  close(): void {
    this.conn.close();
    this.local.close();
    this.remote.close();
  }
}

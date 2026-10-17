import { EVENTS_TRACK, playerPath } from './paths';
import { keepSubscribed, MoqSession, type MoqConnector } from './session';

// GM がプレイヤーの `p/{pid}` の events を受け取るための購読の束。
// 1 セッションのリクエスト予算（40）に余裕を残すよう、perSession 人ごとに別の MoqSession を張る。
// 張り直しで開いたグループが最初から届き直すので、PlayerEvent の seq が増えていないフレームは捨てる。

const RESUBSCRIBE_MAX_MS = 10_000;
const decoder = new TextDecoder();

/** 封筒の body.seq（数でなければ undefined）。署名の検証は受け取った側が行う。 */
function seqOf(bytes: Uint8Array): number | undefined {
  try {
    const seq: unknown = JSON.parse(decoder.decode(bytes))?.body?.seq;
    return typeof seq === 'number' && Number.isFinite(seq) ? seq : undefined;
  } catch {
    return undefined;
  }
}

interface Pool {
  session: MoqSession;
  pids: Set<string>;
}

export class GmInbox {
  readonly #pools: Pool[] = [];
  readonly #stops = new Map<string, { pool: Pool; stop: () => void }>();

  constructor(
    private readonly url: string,
    private readonly connector: MoqConnector,
    private readonly perSession = 20,
  ) {}

  add(pid: string, onFrame: (bytes: Uint8Array) => void): void {
    if (this.#stops.has(pid)) return;
    let pool = this.#pools.find((p) => p.pids.size < this.perSession);
    if (!pool) {
      pool = { session: new MoqSession(this.url, this.connector), pids: new Set() };
      this.#pools.push(pool);
      const p = pool;
      const connect = (): void =>
        void p.session.start().catch((e: unknown) => {
          console.warn('MoQ の接続に失敗した', e);
          if (this.#pools.includes(p)) setTimeout(connect, 1000);
        });
      connect();
    }
    pool.pids.add(pid);
    let lastSeq = -1;
    const receive = (bytes: Uint8Array) => {
      const seq = seqOf(bytes);
      if (seq !== undefined) {
        if (seq <= lastSeq) return;
        lastSeq = seq;
      }
      onFrame(bytes);
    };
    // プレイヤーは後から publish することもあるので、announce を待たずに購読し、終わったらやり直す。
    // まだ publish していない人への再購読で予算を使い切らないよう、間隔の上限は 10 秒にする。
    const stop = keepSubscribed(pool.session, playerPath(pid), EVENTS_TRACK, receive, {
      blind: true,
      maxDelayMs: RESUBSCRIBE_MAX_MS,
    });
    this.#stops.set(pid, { pool, stop });
  }

  remove(pid: string): void {
    const entry = this.#stops.get(pid);
    if (!entry) return;
    entry.stop();
    entry.pool.pids.delete(pid);
    this.#stops.delete(pid);
  }

  close(): void {
    for (const { stop } of this.#stops.values()) stop();
    this.#stops.clear();
    for (const p of this.#pools) p.session.close();
    this.#pools.length = 0;
  }
}

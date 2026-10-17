import { EVENTS_TRACK, playerPath } from './paths';
import { keepSubscribed, MoqSession, type MoqConnector } from './session';

// GM がプレイヤーの `p/{pid}` の events を受け取るための購読の束。
// 1 セッションのリクエスト予算に収まるよう、perSession 人ごとに別の MoqSession を張る。

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
    private readonly perSession = 35,
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
    // プレイヤーは後から publish することもあるので、announce を待たずに購読し、終わったらやり直す
    const stop = keepSubscribed(pool.session, playerPath(pid), EVENTS_TRACK, onFrame, { blind: true });
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

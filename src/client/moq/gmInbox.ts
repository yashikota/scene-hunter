import * as v from 'valibot';
import type { Envelope, EnvelopeVerifier } from '../../shared/envelope';
import { PlayerEventSchema, type PlayerEvent } from '../../shared/protocol';
import { EVENTS_TRACK, playerPath } from './paths';
import { keepSubscribed, MoqSession, type MoqConnector } from './session';

// GM がプレイヤーの `p/{pid}` の events を受け取るための購読の束。
// 1 セッションのリクエスト予算（40）に余裕を残すよう、perSession 人ごとに別の MoqSession を張る。
// フレームは verifier.open を通り、body.pid がその購読の pid と一致し、PlayerEventSchema を満たすものだけを渡す。
// 張り直しで開いたグループが最初から届き直すので、seq が増えていないものは捨てる。
// seq は検証を通ったフレームでだけ進める（偽のフレームの大きな seq で本人のメッセージが捨てられないように）。

const RESUBSCRIBE_MAX_MS = 10_000;
const decoder = new TextDecoder();

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
    private readonly verifier: EnvelopeVerifier,
    private readonly perSession = 20,
  ) {}

  add(pid: string, onMessage: (e: PlayerEvent) => void): void {
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
    let removed = false;
    // 検証は非同期なので、届いた順に 1 つずつ処理する
    let queue = Promise.resolve();
    const receive = (bytes: Uint8Array) => {
      queue = queue.then(async () => {
        let env: Envelope<{ pid: string }>;
        try {
          env = JSON.parse(decoder.decode(bytes));
        } catch {
          return;
        }
        const opened = await this.verifier.open(env);
        if (removed || !opened || opened.body.pid !== pid) return;
        const r = v.safeParse(PlayerEventSchema, opened.body);
        if (!r.success || r.output.seq <= lastSeq) return;
        lastSeq = r.output.seq;
        onMessage(r.output);
      });
    };
    // プレイヤーは後から publish することもあるので、announce を待たずに購読し、終わったらやり直す。
    // まだ publish していない人への再購読で予算を使い切らないよう、間隔の上限は 10 秒にする。
    const stop = keepSubscribed(pool.session, playerPath(pid), EVENTS_TRACK, receive, {
      blind: true,
      maxDelayMs: RESUBSCRIBE_MAX_MS,
    });
    this.#stops.set(pid, {
      pool,
      stop: () => {
        removed = true;
        stop();
      },
    });
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

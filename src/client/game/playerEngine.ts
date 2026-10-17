import { verifyTransfer, type TransferCert } from '../../shared/cert';
import type { EnvelopeVerifier } from '../../shared/envelope';
import { seal } from '../../shared/envelope';
import type { GmEvent, GmSnapshot, PlayerEvent } from '../../shared/protocol';
import { followGm } from '../moq/follow';
import { EVENTS_TRACK, playerPath } from '../moq/paths';
import { MoqSession, type FrameWriter, type MoqConnector } from '../moq/session';
import type { Me } from './membership';
import { applyEvent, applySnapshot, hasGap, initialView, type PlayerView } from './playerView';
import { encodeFrame, keepStarting } from './wire';

// プレイヤーのブラウザ側。MoQ のセッションを 2 本使う（R21）：
// p/{pid} に publish するだけのセッションと、gm/* を追いかけるだけのセッション。

/** 送るイベントの本体（pid と seq は送るときに付ける）。 */
export type PlayerEventBody = WithoutHeader<PlayerEvent>;
type WithoutHeader<E> = E extends unknown ? Omit<E, 'pid' | 'seq'> : never;

/** resync を送る最短の間隔。 */
const RESYNC_MIN_MS = 3000;
/**
 * ロビーの一覧に自分が載らないまま、この時間が過ぎたら publish をやり直す（GM が announce を受け損ねたとき）。
 * やり直すたびに倍にし、REJOIN_MAX_MS で止める。一覧に載ったら最初に戻す。
 */
export const REJOIN_AFTER_MS = 8000;
export const REJOIN_MAX_MS = 60_000;

export interface PlayerEngineDeps {
  connector: MoqConnector;
  verifier: EnvelopeVerifier;
  privateKey: CryptoKey;
  serverPub: string;
  /** ミリ秒。 */
  now: () => number;
  /** seq を使うたびに、次の seq を渡す（保存して再読み込みでも続けるため）。 */
  saveSeq(next: number): void;
  /** 自分が GM の交代先に選ばれた。 */
  onTransferToMe(transfer: TransferCert): void;
}

export class PlayerEngine {
  view: PlayerView = initialView();
  /** 追いかけている gm/{epoch}。まだ見つけていなければ -1。 */
  epoch = -1;
  /** いま従っている GM。最初の GM のフレームを受けるまでは null（role が gm の参加証なら受け付ける）。 */
  gmPid: string | null = null;
  readonly #me: Me;
  readonly #deps: PlayerEngineDeps;
  readonly #listeners = new Set<() => void>();
  #seq: number;
  #pubSession?: MoqSession;
  #writer?: FrameWriter;
  #followSession?: MoqSession;
  #stopFollow?: () => void;
  #rejoinTimer?: ReturnType<typeof setInterval>;
  #unlistedSince: number | null = null;
  #rejoinAfterMs = REJOIN_AFTER_MS;
  #queue: Promise<void> = Promise.resolve();
  #lastResyncAt = -Infinity;
  #closed = false;

  constructor(me: Me, deps: PlayerEngineDeps) {
    this.#me = me;
    this.#deps = deps;
    this.#seq = me.seq;
  }

  start(): void {
    if (this.#closed || this.#followSession) return;
    const { connector, verifier } = this.#deps;
    this.#publish();

    const follow = new MoqSession(this.#me.moqUrl, connector);
    this.#followSession = follow;
    this.#stopFollow = followGm(follow, verifier, (pid) => this.#isGm(pid), {
      event: (e) => this.#onEvent(e),
      snapshot: (s) => this.#onSnapshot(s),
      epoch: (n) => {
        this.epoch = n;
      },
    });
    keepStarting(follow, () => this.#closed);
    this.#rejoinTimer = setInterval(() => this.#checkListed(), 1000);
  }

  send(body: PlayerEventBody): void {
    if (this.#closed) return;
    const seq = this.#seq++;
    this.#deps.saveSeq(this.#seq);
    const env = { ...body, pid: this.#me.pid, seq };
    const { privateKey } = this.#deps;
    const cert = this.#me.cert;
    // 参加証は毎回付ける（GM がどのメッセージから受け始めても検証できるように）。
    this.#queue = this.#queue
      .then(async () => {
        if (this.#closed) return;
        this.#writer?.write(encodeFrame(await seal(env, privateKey, cert)));
      })
      .catch((err: unknown) => console.error('メッセージを送れなかった', err));
  }

  /** ここまでに送ったメッセージを書き終えるまで待つ。 */
  flush(): Promise<void> {
    return this.#queue;
  }

  /** 従っている GM の名前（参加証の名前）。 */
  gmName(): string {
    const pid = this.gmPid ?? this.view.gmPid;
    return (pid && this.#deps.verifier.certOf(pid)?.body.name) || '';
  }

  subscribe(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    clearInterval(this.#rejoinTimer);
    this.#listeners.clear();
    this.#stopFollow?.();
    this.#followSession?.close();
    this.#pubSession?.close();
  }

  #publish(): void {
    this.#pubSession?.close();
    const session = new MoqSession(this.#me.moqUrl, this.#deps.connector);
    this.#pubSession = session;
    this.#writer = session.publish(playerPath(this.#me.pid), EVENTS_TRACK);
    keepStarting(session, () => this.#closed || this.#pubSession !== session);
    this.send({ type: 'join', name: this.#me.name });
  }

  /** GM が announce を受け損ねると自分が一覧に載らないので、publish をやり直して announce し直す。 */
  #checkListed(): void {
    const v = this.view;
    const listed = v.players.some((p) => p.pid === this.#me.pid);
    if (listed || v.phase === 'connecting' || v.phase === 'dissolved') {
      this.#unlistedSince = null;
      if (listed) this.#rejoinAfterMs = REJOIN_AFTER_MS;
      return;
    }
    const now = this.#deps.now();
    this.#unlistedSince ??= now;
    if (now - this.#unlistedSince < this.#rejoinAfterMs) return;
    this.#unlistedSince = now;
    this.#rejoinAfterMs = Math.min(this.#rejoinAfterMs * 2, REJOIN_MAX_MS);
    this.#publish();
  }

  #isGm(pid: string): boolean {
    if (this.gmPid !== null) return pid === this.gmPid;
    return this.#deps.verifier.certOf(pid)?.body.role === 'gm';
  }

  #onEvent(e: GmEvent): void {
    this.gmPid ??= e.pid;
    if (e.type === 'transfer') {
      this.#onTransfer(e).catch((err: unknown) => console.error('GM の交代を処理できなかった', err));
      return;
    }
    if (hasGap(this.view, e)) this.#resync();
    this.#set(applyEvent(this.view, e, this.#deps.now()));
  }

  #onSnapshot(s: GmSnapshot): void {
    this.gmPid ??= s.pid;
    // 受け取り済みのイベントより古いスナップショットは使わない（state と events は別の Track で、順番が前後する）。
    if (this.view.phase !== 'connecting' && s.lastEventSeq < this.view.lastSeq) return;
    this.#set(applySnapshot(this.view, s, this.#deps.now()));
  }

  async #onTransfer(e: Extract<GmEvent, { type: 'transfer' }>): Promise<void> {
    const { transfer } = e;
    const nowSec = Math.floor(this.#deps.now() / 1000);
    if (transfer.body.from !== e.pid) return;
    if (!(await verifyTransfer(this.#deps.serverPub, transfer, this.#me.code, nowSec))) return;
    if (this.#closed || this.gmPid !== e.pid) return;
    // 以後は交代先だけに従う。新しい GM の seq は 0 から数えるので、取りこぼしの判定も最初から。
    this.gmPid = transfer.body.to;
    this.#set({ ...this.view, lastSeq: -1 });
    if (transfer.body.to === this.#me.pid) this.#deps.onTransferToMe(transfer);
  }

  #resync(): void {
    const now = this.#deps.now();
    if (now - this.#lastResyncAt < RESYNC_MIN_MS) return;
    this.#lastResyncAt = now;
    this.send({ type: 'resync' });
  }

  #set(v: PlayerView): void {
    // 解散したら、その後に届くもの（古いスナップショットなど）では画面を変えない。
    if (v === this.view || this.view.phase === 'dissolved') return;
    this.view = v;
    for (const fn of this.#listeners) fn();
  }
}

import type { EnvelopeVerifier } from '../../shared/envelope';
import { seal } from '../../shared/envelope';
import type { GmEventBody, GmSnapshot, PlayerEvent } from '../../shared/protocol';
import { GmInbox } from '../moq/gmInbox';
import { EVENTS_TRACK, gmPath, STATE_TRACK } from '../moq/paths';
import { MoqSession, type FrameWriter, type MoqConnector } from '../moq/session';
import { gmReduce, initialGmState, snapshotOf, type GmAction, type GmState } from './gmMachine';
import { clearGm, loadGm, saveGm } from './gmPersist';
import type { Me } from './membership';
import { applySnapshot, initialView, type PlayerView } from './playerView';
import { encodeFrame, keepStarting } from './wire';

// GM のブラウザでゲームを回す：gmReduce に入れたアクションのイベントを封筒に入れて gm/{epoch} の events に書き、
// 状態が変わるたびと 5 秒ごとに state にスナップショットを書き、localStorage に保存する。
// プレイヤーの p/{pid} は announce で見つけて GmInbox で受ける。

export const TICK_MS = 250;
export const SNAPSHOT_EVERY_MS = 5000;
/** resync の要求に応えてスナップショットを書く最短の間隔。 */
const RESYNC_MIN_MS = 1000;
const PLAYER_PREFIX = 'p/';

/** gm/{epoch} の epoch と、イベントとスナップショットそれぞれの最後の seq。GM の状態と一緒に保存する。 */
interface Link {
  epoch: number;
  eventSeq: number;
  snapshotSeq: number;
}

const linkKey = (room: string) => `sh:gmlink:${room}`;

function loadLink(room: string): Link {
  try {
    const o = JSON.parse(localStorage.getItem(linkKey(room)) ?? 'null') as Partial<Link> | null;
    if (
      o &&
      Number.isInteger(o.epoch) &&
      Number.isInteger(o.eventSeq) &&
      Number.isInteger(o.snapshotSeq)
    ) {
      return o as Link;
    }
  } catch {
    // 壊れていれば最初から
  }
  return { epoch: 0, eventSeq: -1, snapshotSeq: -1 };
}

function saveLink(room: string, link: Link): void {
  try {
    localStorage.setItem(linkKey(room), JSON.stringify(link));
  } catch {
    // 保存できなければ再読み込みからの復元ができないだけ
  }
}

/** この部屋の GM としての保存（状態と epoch）を消す。解散や GM の交代の後に使う。 */
export function forgetGm(room: string): void {
  clearGm(room);
  try {
    localStorage.removeItem(linkKey(room));
  } catch {
    // 消せなくても、epoch が大きめから始まるだけ
  }
}

export interface GmEngineDeps {
  connector: MoqConnector;
  verifier: EnvelopeVerifier;
  privateKey: CryptoKey;
  /** ミリ秒。 */
  now: () => number;
}

export class GmEngine {
  state: GmState;
  /** start で決まる。 */
  epoch = 0;
  readonly #me: Me;
  readonly #deps: GmEngineDeps;
  readonly #link: Link;
  readonly #listeners = new Set<() => void>();
  readonly #timers: ReturnType<typeof setInterval>[] = [];
  #session?: MoqSession;
  #inbox?: GmInbox;
  #events?: FrameWriter;
  #stateTrack?: FrameWriter;
  /** 封筒の署名は非同期なので、書く順番を保つために 1 本の鎖でつなぐ。 */
  #queue: Promise<void> = Promise.resolve();
  #lastResyncAt = -Infinity;
  #stopped = false;
  #closed = false;

  constructor(me: Me, deps: GmEngineDeps) {
    this.#me = me;
    this.#deps = deps;
    this.#link = loadLink(me.code);
    const saved = loadGm(me.code);
    this.state =
      saved && saved.room === me.code && saved.gmPid === me.pid
        ? saved
        : initialGmState({
            room: me.code,
            gmPid: me.pid,
            locale: me.locale,
            rounds: me.rounds,
            limitSec: me.limitSec,
          });
  }

  /**
   * 前の epoch より 1 つ大きい gm/{epoch} で publish を始める。
   * minEpoch は、GM を引き継いだ人が前の GM の epoch を越えるために渡す。
   */
  start(minEpoch = 0): void {
    if (this.#closed || this.#session) return;
    const { connector } = this.#deps;
    this.epoch = Math.max(this.#link.epoch, minEpoch) + 1;
    this.#link.epoch = this.epoch;
    saveLink(this.#me.code, this.#link);

    const session = new MoqSession(this.#me.moqUrl, connector);
    this.#session = session;
    this.#events = session.publish(gmPath(this.epoch), EVENTS_TRACK);
    this.#stateTrack = session.publish(gmPath(this.epoch), STATE_TRACK);
    this.#inbox = new GmInbox(this.#me.moqUrl, connector, this.#deps.verifier);
    for (const pid of Object.keys(this.state.players)) this.#listen(pid);
    session.announced((path, active) => {
      if (!path.startsWith(PLAYER_PREFIX)) return;
      const pid = path.slice(PLAYER_PREFIX.length);
      if (!pid || pid === this.#me.pid) return;
      if (active) this.#listen(pid);
      else this.#inbox?.remove(pid);
    });
    keepStarting(session, () => this.#closed);

    this.#writeSnapshot();
    this.#timers.push(
      setInterval(() => this.dispatch({ type: 'tick', now: this.#deps.now() }), TICK_MS),
      setInterval(() => this.#writeSnapshot(), SNAPSHOT_EVERY_MS),
    );
  }

  dispatch(action: GmAction): void {
    if (this.#stopped) return;
    const step = gmReduce(this.state, action);
    if (step.state === this.state && step.emit.length === 0) return;
    this.state = step.state;
    for (const e of step.emit) this.#writeEvent(e);
    saveGm(this.#me.code, this.state);
    this.#writeSnapshot();
    for (const fn of this.#listeners) fn();
  }

  /** GM の画面用の表示モデル（プレイヤーと同じ形）。 */
  view(): PlayerView {
    const now = this.#deps.now();
    const snap: GmSnapshot = {
      ...snapshotOf(this.state, now),
      pid: this.#me.pid,
      seq: 0,
      epoch: Math.max(1, this.epoch),
      lastEventSeq: this.#link.eventSeq,
    };
    return applySnapshot(initialView(), snap, now);
  }

  subscribe(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** ここまでに書いたフレームを渡し終えるまで待つ。 */
  flush(): Promise<void> {
    return this.#queue;
  }

  /**
   * 状態を進めるのをやめ、lingerMs 後に接続を閉じる。
   * GM の交代や解散では、最後のイベントが Relay に届くよう少し待ってから閉じる。
   */
  close(lingerMs = 0): void {
    // 2 回目以降は何もしない（先に決めた待ち時間を短くしない）
    if (this.#stopped) return;
    this.#stopped = true;
    for (const t of this.#timers.splice(0)) clearInterval(t);
    this.#listeners.clear();
    const shut = () => {
      this.#closed = true;
      this.#inbox?.close();
      this.#session?.close();
    };
    if (lingerMs > 0) setTimeout(() => void this.#queue.then(shut), lingerMs);
    else shut();
  }

  #listen(pid: string): void {
    this.#inbox?.add(pid, (e) => this.#onPlayer(e));
  }

  #onPlayer(e: PlayerEvent): void {
    // プレイヤーの参加証を持つ人のメッセージだけを受け付ける（GmInbox が署名と pid の一致を確かめた後）。
    const cert = this.#deps.verifier.certOf(e.pid);
    if (cert?.body.role !== 'player') return;
    const at = this.#deps.now();
    switch (e.type) {
      case 'join':
        // 名前は Worker が署名した参加証のものを使う。
        return this.dispatch({ type: 'playerJoined', pid: e.pid, name: cert.body.name, at });
      case 'shutter':
        return this.dispatch({ type: 'shutter', round: e.round, pid: e.pid, hash: e.hash, at });
      case 'submit':
        return this.dispatch({ type: 'submit', round: e.round, pid: e.pid, key: e.key, at });
      case 'resync':
        if (at - this.#lastResyncAt < RESYNC_MIN_MS) return;
        this.#lastResyncAt = at;
        return this.#writeSnapshot();
    }
  }

  #writeEvent(e: GmEventBody): void {
    const seq = ++this.#link.eventSeq;
    saveLink(this.#me.code, this.#link);
    const body = { ...e, pid: this.#me.pid, seq, epoch: this.epoch };
    this.#enqueue(body, (bytes) => this.#events?.write(bytes));
  }

  #writeSnapshot(): void {
    // スナップショットには解散の印が無いので、解散の後に書くと受け手がロビーに戻ってしまう。
    if (this.#stopped || this.state.dissolved) return;
    const seq = ++this.#link.snapshotSeq;
    saveLink(this.#me.code, this.#link);
    const body: GmSnapshot = {
      ...snapshotOf(this.state, this.#deps.now()),
      pid: this.#me.pid,
      seq,
      epoch: this.epoch,
      lastEventSeq: this.#link.eventSeq,
    };
    this.#enqueue(body, (bytes) => this.#stateTrack?.snapshot(bytes));
  }

  #enqueue(body: { pid: string }, write: (bytes: Uint8Array) => void): void {
    const { privateKey } = this.#deps;
    const cert = this.#me.cert;
    this.#queue = this.#queue
      .then(async () => {
        if (this.#closed) return;
        write(encodeFrame(await seal(body, privateKey, cert)));
      })
      .catch((err: unknown) => console.error('GM のメッセージを送れなかった', err));
  }
}

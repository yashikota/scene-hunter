import type { EnvelopeVerifier } from '../../shared/envelope';
import { seal } from '../../shared/envelope';
import type { GmEventBody, GmSnapshot, PlayerEvent } from '../../shared/protocol';
import { GmInbox } from '../moq/gmInbox';
import { EVENTS_TRACK, gmPath, STATE_TRACK } from '../moq/paths';
import { MoqSession, type FrameWriter, type MoqConnector } from '../moq/session';
import {
  gmReduce,
  hasLeft,
  initialGmState,
  snapshotOf,
  type GmAction,
  type GmState,
} from './gmMachine';
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
/** この時間、何のメッセージも届かなかったプレイヤーを away にする（プレイヤーは PING_EVERY_MS ごとに ping を送る）。 */
export const PRESENCE_TIMEOUT_MS = 20_000;
/** away の判定を見直す間隔。 */
const PRESENCE_CHECK_MS = 1000;
/**
 * 前の判定からこれより長く空いたら、GM のタブが止まっていた（画面のロックなど）とみなす。
 * その間はプレイヤーのメッセージも処理できていないので、全員の最後の時刻を今にし直す。
 */
export const PRESENCE_SUSPEND_GAP_MS = 5000;
/**
 * away のメッセージは、その人の away を前に切り替えてからこの間隔の間は受け付けない
 * （away と ping を交互に送って、GM にスナップショットやロビーのイベントを書かせ続けることができないように）。
 * 戻す方はすぐに受け付ける（再読み込みの直後の join などで待たせない）。切り替えは 1 人につき 2 秒に 1 往復まで。
 */
export const PRESENCE_FLIP_MIN_MS = 2000;
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
  /** プレイヤーごとの、最後に検証済みのメッセージを受けた時刻（GM の時計）。保存はしない。 */
  readonly #lastSeen = new Map<string, number>();
  /** プレイヤーごとの、最後に away を切り替えた時刻。 */
  readonly #lastFlip = new Map<string, number>();
  #lastCheckAt?: number;
  #unlisten?: () => void;
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
    // 再開した直後は、全員がたった今まで居たものとして数え始める。
    const now = this.#deps.now();
    for (const pid of Object.keys(this.state.players)) {
      this.#lastSeen.set(pid, now);
      this.#listen(pid);
    }
    session.announced((path, active) => {
      if (!path.startsWith(PLAYER_PREFIX)) return;
      const pid = path.slice(PLAYER_PREFIX.length);
      if (!pid || pid === this.#me.pid || hasLeft(this.state, pid)) return;
      if (active) this.#listen(pid);
      else this.#inbox?.remove(pid);
    });
    keepStarting(session, () => this.#closed);

    this.#writeSnapshot();
    this.#timers.push(
      setInterval(() => this.dispatch({ type: 'tick', now: this.#deps.now() }), TICK_MS),
      setInterval(() => this.#writeSnapshot(), SNAPSHOT_EVERY_MS),
      setInterval(() => this.#checkPresence(), PRESENCE_CHECK_MS),
    );
    // タブが見えるようになったら、止まっていた間の分で誰かを away にしないよう数え直す。
    if (typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') this.#reseed();
      };
      document.addEventListener('visibilitychange', onVisible);
      this.#unlisten = () => document.removeEventListener('visibilitychange', onVisible);
    }
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
    this.#unlisten?.();
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

  /**
   * しばらくメッセージの届かない人を away にする。
   * 既知の制限：GM のタブが長く隠れていると、Chrome はタイマーを 1 分おき程度に間引く。そのときは毎回
   * 判定の間隔が PRESENCE_SUSPEND_GAP_MS を超えて数え直すので、黙って途切れた人を away にできない
   * （away を送った人と leave は扱える）。遊んでいる間の GM はタブを表に出している前提で、直さない。
   */
  #checkPresence(): void {
    const now = this.#deps.now();
    const gap = this.#lastCheckAt === undefined ? 0 : now - this.#lastCheckAt;
    this.#lastCheckAt = now;
    // GM のタブが止まっていた。届いていないのは GM の側の事情なので、誰も away にしない。
    if (gap > PRESENCE_SUSPEND_GAP_MS) return this.#reseed();
    for (const [pid, p] of Object.entries(this.state.players)) {
      if (p.away || hasLeft(this.state, pid)) continue;
      const seen = this.#lastSeen.get(pid);
      if (seen === undefined) this.#lastSeen.set(pid, now);
      else if (now - seen > PRESENCE_TIMEOUT_MS)
        this.dispatch({ type: 'presence', pid, active: false });
    }
  }

  /** 全員の最後のメッセージの時刻を今にする。 */
  #reseed(): void {
    const now = this.#deps.now();
    this.#lastCheckAt = now;
    for (const pid of Object.keys(this.state.players)) this.#lastSeen.set(pid, now);
  }

  /** プレイヤーのメッセージによる away の切り替え。away にするのは前の切り替えから PRESENCE_FLIP_MIN_MS 後から。 */
  #flip(pid: string, active: boolean, at: number): void {
    const p = Object.hasOwn(this.state.players, pid) ? this.state.players[pid] : undefined;
    if (!p || !p.away === active) return;
    if (!active && at - (this.#lastFlip.get(pid) ?? -Infinity) < PRESENCE_FLIP_MIN_MS) return;
    this.#lastFlip.set(pid, at);
    this.dispatch({ type: 'presence', pid, active });
  }

  #onPlayer(e: PlayerEvent): void {
    // プレイヤーの参加証を持つ人のメッセージだけを受け付ける（GmInbox が署名と pid の一致を確かめた後）。
    const cert = this.#deps.verifier.certOf(e.pid);
    if (cert?.body.role !== 'player') return;
    // 部屋を出た人のメッセージは、もう何も受け付けない。
    if (hasLeft(this.state, e.pid)) return;
    const at = this.#deps.now();
    this.#lastSeen.set(e.pid, at);
    if (e.type === 'leave') {
      this.#lastSeen.delete(e.pid);
      this.dispatch({ type: 'playerLeft', pid: e.pid });
      this.#inbox?.remove(e.pid);
      return;
    }
    if (e.type === 'away') return this.#flip(e.pid, false, at);
    // away だった人は、何か届いた時点で戻す（提出などの処理より先に。away でなければ何も起きない）。
    this.#flip(e.pid, true, at);
    switch (e.type) {
      case 'ping':
        return;
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

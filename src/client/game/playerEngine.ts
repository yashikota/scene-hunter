import { verifyTransfer, type TransferCert } from "../../shared/cert";
import type { EnvelopeVerifier } from "../../shared/envelope";
import { seal } from "../../shared/envelope";
import type { GmEvent, GmSnapshot, PlayerEvent } from "../../shared/protocol";
import { followGm } from "../moq/follow";
import { EVENTS_TRACK, gmPath, playerPath } from "../moq/paths";
import { MoqSession, type FrameWriter, type MoqConnector } from "../moq/session";
import { LinkWatch } from "./linkWatch";
import type { Me } from "./membership";
import { applyEvent, applySnapshot, hasGap, initialView, type PlayerView } from "./playerView";
import { encodeFrame, keepStarting } from "./wire";

// プレイヤーのブラウザ側。MoQ のセッションを 2 本使う（R21）：
// p/{pid} に publish するだけのセッションと、gm/* を追いかけるだけのセッション。

/** 送るイベントの本体（pid と seq は送るときに付ける）。 */
export type PlayerEventBody = WithoutHeader<PlayerEvent>;
type WithoutHeader<E> = E extends unknown ? Omit<E, "pid" | "seq"> : never;

/** resync を送る最短の間隔。 */
const RESYNC_MIN_MS = 3000;
/**
 * ロビーの一覧に自分が載らないまま、この時間が過ぎたら publish をやり直す（GM が announce を受け損ねたとき）。
 * やり直すたびに倍にし、REJOIN_MAX_MS で止める。一覧に載ったら最初に戻す。
 */
export const REJOIN_AFTER_MS = 8000;
export const REJOIN_MAX_MS = 60_000;
/**
 * GM を渡した後は、渡した GM の接続が閉じるのは普通のことなので、交代先が新しい epoch で出てくるのをこの時間だけ待ってから
 * 「GM の接続が切れた」とする（交代先の引き継ぎが失敗し続けても、残った人が待ち続けないように）。
 */
export const TRANSFER_GRACE_MS = 45_000;
/** 生きている知らせ（ping）を送る間隔。GM は PRESENCE_TIMEOUT_MS（20 秒）届かなければ away にする。 */
export const PING_EVERY_MS = 5000;
/**
 * p/{pid} の events は、このフレーム数かこの時間を超えたら、次の ping の直前で新しいグループに切り替える。
 * 新しく購読した GM（再読み込み、交代、張り直し）には最新のグループがまるごと届き、1 フレームずつ署名を確かめるので、
 * 1 つのグループを伸ばし続けないようにする。新しいグループは join から始め、それだけで GM の一覧に載れるようにする。
 * 区切るのは ping の直前だけにする：shutter や submit の直後に区切ると、その最後のフレームを新しいグループが追い越し、
 * 受け手が古いグループを読み捨てることがある（GM 側も maxAge を延ばして古いグループを読み切るが、念のため両方で防ぐ）。
 * ping は 5 秒ごとなので、グループはおよそ GROUP_MAX_FRAMES + 5 秒分のフレームまでに収まる。
 */
export const GROUP_MAX_FRAMES = 12;
export const GROUP_MAX_MS = 60_000;
/**
 * seq は先にこの数だけ確保して保存する（ping のたびに保存しない）。再読み込みすると確保した分の先から数えるので、
 * 使った seq を使い直すことは無い（GM は seq が増えていないメッセージを捨てる）。飛んだ分は害が無い。
 */
export const SEQ_BLOCK = 32;

export interface PlayerEngineDeps {
  connector: MoqConnector;
  verifier: EnvelopeVerifier;
  privateKey: CryptoKey;
  serverPub: string;
  /** ミリ秒。 */
  now: () => number;
  /** seq を使うたびに、次の seq を渡す（保存して再読み込みでも続けるため）。 */
  saveSeq(next: number): void;
  /** 従う GM が交代で替わった（保存して、再読み込みしても交代先だけに従うため）。 */
  saveGmPid(pid: string): void;
  /** 自分が GM の交代先に選ばれた。 */
  onTransferToMe(transfer: TransferCert): void;
}

export class PlayerEngine {
  view: PlayerView = initialView();
  /** 追いかけている gm/{epoch}。まだ見つけていなければ -1。 */
  epoch = -1;
  /**
   * いま従っている GM。サーバーから受け取った pid（Me.gmPid）から始め、検証した交代のイベントで替える。
   * null（古い保存）なら、最初に届いた role が gm の参加証のフレームの送り主に従う。
   */
  gmPid: string | null;
  /**
   * いま追いかけている GM の broadcast（gm/{epoch}）の announce が消えたときの時刻（自分の時計）。
   * 新しい epoch に乗り換えるか、同じ broadcast が announce し直されたら null に戻る。
   * GM を渡した後は TRANSFER_GRACE_MS の間、null のまま待つ。
   */
  gmDisconnectedSince: number | null = null;
  #me: Me;
  readonly #deps: PlayerEngineDeps;
  readonly #listeners = new Set<() => void>();
  #seq: number;
  /** 保存済みの seq の上限（これ未満なら保存せずに使える）。 */
  #seqReserved: number;
  /** いまのグループに書いたフレームの数と、グループを始めた時刻。 */
  #groupFrames = 0;
  #groupStartedAt = 0;
  #pubSession?: MoqSession;
  #writer?: FrameWriter;
  #followSession?: MoqSession;
  #stopFollow?: () => void;
  #rejoinTimer?: ReturnType<typeof setInterval>;
  #pingTimer?: ReturnType<typeof setInterval>;
  #unlisten?: () => void;
  #unlistedSince: number | null = null;
  #rejoinAfterMs = REJOIN_AFTER_MS;
  #queue: Promise<void> = Promise.resolve();
  #lastResyncAt = -Infinity;
  #closed = false;
  /** close を呼んだ後（接続はまだ閉じていないこともある）。以後は何も送らない。 */
  #stopped = false;
  #transferred = false;
  #goneTimer?: ReturnType<typeof setTimeout>;
  /** 自分の 2 本のセッションが切れていないか（切れたらセッションが自分で張り直す）。 */
  readonly #link: LinkWatch;

  constructor(me: Me, deps: PlayerEngineDeps) {
    this.#me = me;
    this.#deps = deps;
    this.#seq = me.seq;
    this.#seqReserved = me.seq;
    this.gmPid = me.gmPid ?? null;
    this.#link = new LinkWatch(deps.now, () => this.#notify());
  }

  /** 自分の接続が切れて、RECONNECT_NOTICE_MS 以上つなぎ直せていない。 */
  get reconnecting(): boolean {
    return this.#link.reconnecting;
  }

  start(): void {
    if (this.#closed || this.#followSession) return;
    const { connector, verifier } = this.#deps;
    this.#publish();

    const follow = new MoqSession(this.#me.moqUrl, connector);
    this.#followSession = follow;
    follow.onStatus((st) => this.#link.set("follow", st));
    this.#stopFollow = followGm(follow, verifier, (pid) => this.#isGm(pid), {
      event: (e) => this.#onEvent(e),
      snapshot: (s) => this.#onSnapshot(s),
      epoch: (n) => {
        this.epoch = n;
        this.#transferred = false;
        this.#gmBack();
      },
    });
    follow.announced((path, active) => {
      if (path !== gmPath(this.epoch)) return;
      if (active) this.#gmBack();
      else this.#gmGone();
    });
    keepStarting(follow, () => this.#closed);
    this.#rejoinTimer = setInterval(() => this.#checkListed(), 1000);
    this.#pingTimer = setInterval(() => this.send({ type: "ping" }), PING_EVERY_MS);
    // タブを閉じる（かもしれない）ときは away を送る。再読み込みでも起きるので leave にはしない
    // （再読み込みした後の join で GM は away を解く）。届かなくても ping が途切れて away になる。
    if (typeof window !== "undefined") {
      const hide = () => {
        this.send({ type: "away" });
        // 閉じるかもしれないので、確保した分ではなく使った分だけを保存し直す（再読み込みでの飛びを小さくする）。
        // bfcache から戻って続けるときは、次に送るときに確保し直す。
        this.#seqReserved = this.#seq;
        this.#deps.saveSeq(this.#seq);
      };
      const show = (e: PageTransitionEvent) => {
        if (e.persisted) this.send({ type: "ping" });
      };
      window.addEventListener("pagehide", hide);
      window.addEventListener("pageshow", show);
      this.#unlisten = () => {
        window.removeEventListener("pagehide", hide);
        window.removeEventListener("pageshow", show);
      };
    }
  }

  send(body: PlayerEventBody): void {
    if (this.#stopped) return;
    const now = this.#deps.now();
    if (
      body.type === "ping" &&
      (this.#groupFrames >= GROUP_MAX_FRAMES ||
        (this.#groupFrames > 0 && now - this.#groupStartedAt >= GROUP_MAX_MS))
    ) {
      // 書く順は送った順（1 本の鎖）なので、区切りも同じ鎖に入れる。
      this.#groupFrames = 0;
      this.#enqueue(() => this.#writer?.rotate());
      this.#write({ type: "join", name: this.#me.name }, now);
    }
    this.#write(body, now);
  }

  #write(body: PlayerEventBody, now: number): void {
    if (this.#groupFrames === 0) this.#groupStartedAt = now;
    this.#groupFrames++;
    const seq = this.#seq++;
    if (this.#seq > this.#seqReserved) {
      this.#seqReserved = this.#seq - 1 + SEQ_BLOCK;
      this.#deps.saveSeq(this.#seqReserved);
    }
    const env = { ...body, pid: this.#me.pid, seq };
    const { privateKey } = this.#deps;
    const cert = this.#me.cert;
    // 参加証は毎回付ける（GM がどのメッセージから受け始めても検証できるように）。
    this.#enqueue(async () => {
      const bytes = encodeFrame(await seal(env, privateKey, cert));
      if (!this.#closed) this.#writer?.write(bytes);
    });
  }

  #enqueue(job: () => void | Promise<void>): void {
    this.#queue = this.#queue
      .then(async () => {
        if (this.#closed) return;
        await job();
      })
      .catch((err: unknown) => console.error("メッセージを送れなかった", err));
  }

  /** ここまでに送ったメッセージを書き終えるまで待つ。 */
  flush(): Promise<void> {
    return this.#queue;
  }

  /** 名前を変えて取り直した参加証に替え、新しい名前を GM に知らせる。 */
  rename(me: Pick<Me, "name" | "cert">): void {
    this.#me = { ...this.#me, name: me.name, cert: me.cert };
    this.send({ type: "join", name: me.name });
  }

  /** 従っている GM の名前（参加証の名前）。 */
  gmName(): string {
    const pid = this.gmPid ?? this.view.gmPid;
    return (pid && this.#deps.verifier.certOf(pid)?.body.name) || "";
  }

  subscribe(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** 部屋を出たことを GM に知らせる。この後に close(lingerMs) で閉じる。 */
  leave(): void {
    this.send({ type: "leave" });
  }

  /**
   * 何も送らないようにし、lingerMs 後（それまでに送ったメッセージを書き終えてから）接続を閉じる。
   * 部屋を出るときは、leave が Relay に届くよう少し待ってから閉じる。
   */
  close(lingerMs = 0): void {
    if (this.#stopped) return;
    this.#stopped = true;
    clearInterval(this.#rejoinTimer);
    clearInterval(this.#pingTimer);
    clearTimeout(this.#goneTimer);
    this.#link.close();
    this.#unlisten?.();
    this.#listeners.clear();
    this.#stopFollow?.();
    this.#followSession?.close();
    const shut = () => {
      this.#closed = true;
      this.#pubSession?.close();
    };
    if (lingerMs > 0) setTimeout(() => void this.#queue.then(shut), lingerMs);
    else shut();
  }

  #publish(): void {
    this.#pubSession?.close();
    const session = new MoqSession(this.#me.moqUrl, this.#deps.connector);
    this.#pubSession = session;
    this.#writer = session.publish(playerPath(this.#me.pid), EVENTS_TRACK);
    session.onStatus((st) => {
      this.#link.set("pub", st);
      if (st === "down") this.#restartGroup();
    });
    // 新しい Track は最初のフレームで新しいグループを開く
    this.#groupFrames = 0;
    keepStarting(session, () => this.#closed || this.#pubSession !== session);
    this.send({ type: "join", name: this.#me.name });
  }

  /**
   * 接続が切れた。セッションは張り直して同じ p/{pid} に publish し直すので、そこで新しいグループを join から始める
   * （新しく購読した GM にも、最新のグループだけで一覧に載れるように）。seq はそのまま続ける。
   * つながるまでに書いたフレームはセッションが貯め、区切りごとのグループで書く。
   */
  #restartGroup(): void {
    if (this.#stopped) return;
    this.#groupFrames = 0;
    this.#enqueue(() => this.#writer?.rotate());
    this.#write({ type: "join", name: this.#me.name }, this.#deps.now());
  }

  /** GM が announce を受け損ねると自分が一覧に載らないので、publish をやり直して announce し直す。 */
  #checkListed(): void {
    const v = this.view;
    const listed = v.players.some((p) => p.pid === this.#me.pid);
    if (listed || v.phase === "connecting" || v.phase === "dissolved") {
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

  #gmGone(): void {
    if (
      this.#closed ||
      this.#goneTimer ||
      this.gmDisconnectedSince !== null ||
      this.view.phase === "dissolved"
    )
      return;
    const mark = () => {
      this.#goneTimer = undefined;
      this.gmDisconnectedSince = this.#deps.now();
      this.#notify();
    };
    if (this.#transferred) this.#goneTimer = setTimeout(mark, TRANSFER_GRACE_MS);
    else mark();
  }

  #gmBack(): void {
    clearTimeout(this.#goneTimer);
    this.#goneTimer = undefined;
    if (this.gmDisconnectedSince === null) return;
    this.gmDisconnectedSince = null;
    this.#notify();
  }

  #notify(): void {
    for (const fn of this.#listeners) fn();
  }

  /** 従う GM のフレームか。GM の参加証（role が gm）で、従っている pid のものだけ。 */
  #isGm(pid: string): boolean {
    if (this.#deps.verifier.certOf(pid)?.body.role !== "gm") return false;
    return this.gmPid === null || pid === this.gmPid;
  }

  #onEvent(e: GmEvent): void {
    this.gmPid ??= e.pid;
    if (e.type === "transfer") {
      this.#onTransfer(e).catch((err: unknown) =>
        console.error("GM の交代を処理できなかった", err),
      );
      return;
    }
    if (hasGap(this.view, e)) this.#resync();
    this.#set(applyEvent(this.view, e, this.#deps.now()));
  }

  #onSnapshot(s: GmSnapshot): void {
    this.gmPid ??= s.pid;
    // 受け取り済みのイベントより古いスナップショットは使わない（state と events は別の Track で、順番が前後する）。
    if (this.view.phase !== "connecting" && s.lastEventSeq < this.view.lastSeq) return;
    this.#set(applySnapshot(this.view, s, this.#deps.now()));
  }

  async #onTransfer(e: Extract<GmEvent, { type: "transfer" }>): Promise<void> {
    const { transfer } = e;
    const nowSec = Math.floor(this.#deps.now() / 1000);
    if (transfer.body.from !== e.pid) return;
    if (!(await verifyTransfer(this.#deps.serverPub, transfer, this.#me.code, nowSec))) return;
    if (this.#closed || this.gmPid !== e.pid) return;
    // 以後は交代先だけに従う。新しい GM の seq は 0 から数えるので、取りこぼしの判定も最初から。
    this.gmPid = transfer.body.to;
    this.#deps.saveGmPid(transfer.body.to);
    this.#transferred = true;
    this.#set({ ...this.view, lastSeq: -1 });
    if (transfer.body.to === this.#me.pid) this.#deps.onTransferToMe(transfer);
  }

  #resync(): void {
    const now = this.#deps.now();
    if (now - this.#lastResyncAt < RESYNC_MIN_MS) return;
    this.#lastResyncAt = now;
    this.send({ type: "resync" });
  }

  #set(v: PlayerView): void {
    // 解散したら、その後に届くもの（古いスナップショットなど）では画面を変えない。
    if (v === this.view || this.view.phase === "dissolved") return;
    this.view = v;
    this.#notify();
  }
}

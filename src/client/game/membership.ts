import type { Cert, TransferCert } from "../../shared/cert";
import { exportPrivateKey, exportPublicKey, generateKeyPair } from "../../shared/crypto";
import { isLocale, type Locale } from "../../shared/locales";
import { checkRoom, claim, createRoom, joinRoom, type Joined } from "../api";

// 部屋の一員としての資格（参加証、秘密鍵、部屋トークン）を sessionStorage の `sh:me:{code}` に置く。
// 再読み込みしても同じ pid のまま戻れるように、プレイヤーが送るイベントの seq もここに置く
// （GM の受信側は seq が増えていないメッセージを重複として捨てるため）。

export interface Me {
  code: string;
  pid: string;
  name: string;
  role: "gm" | "player";
  roomToken: string;
  cert: Cert;
  /** Ed25519 の秘密鍵（PKCS8 の base64url）。 */
  privateKey: string;
  /** Ed25519 の公開鍵（raw の base64url）。GM の交代で参加証を取り直すときに使う。 */
  pubkey: string;
  moqUrl: string;
  locale: Locale;
  rounds: number;
  limitSec: number;
  /** 次に送る PlayerEvent の seq。 */
  seq: number;
  /**
   * GM の交代の途中。再読み込みしても続きからやり直せるよう、終わるまで保存しておく。
   * - claim：交代先に選ばれた。交代証で GM の参加証を取り直す（fromEpoch は前の GM の epoch）。
   * - rejoin：GM を渡した。新しい鍵でプレイヤーとして入り直す（gmPid は交代先）。
   */
  pending?: PendingStep;
  /** 交代先として GM になったとき、越える前の GM の epoch。 */
  gmEpochFloor?: number;
  /**
   * プレイヤーが従う GM の pid。入ったときにサーバーの部屋の記録から受け取り、検証した交代のイベントで書き換える
   * （再読み込みしても、この pid の GM の参加証だけに従う）。GM を渡して入り直したときは交代先。
   * 古い保存には無いことがあり、そのときは最初に届いた GM の参加証のフレームに従う。
   */
  gmPid?: string;
}

export type PendingStep =
  | { kind: "claim"; transfer: TransferCert; fromEpoch: number }
  | { kind: "rejoin"; gmPid: string };

const keyOf = (code: string) => `sh:me:${code}`;

export function saveMe(me: Me): void {
  try {
    sessionStorage.setItem(keyOf(me.code), JSON.stringify(me));
  } catch {
    // 保存できなくても、このタブを開いている間は遊べる。
  }
}

/** 無い、または壊れていれば null。 */
export function loadMe(code: string): Me | null {
  try {
    const raw = sessionStorage.getItem(keyOf(code));
    if (raw === null) return null;
    const o = JSON.parse(raw) as Partial<Me> | null;
    if (
      !o ||
      o.code !== code ||
      typeof o.pid !== "string" ||
      typeof o.name !== "string" ||
      (o.role !== "gm" && o.role !== "player") ||
      typeof o.roomToken !== "string" ||
      typeof o.cert?.body?.pid !== "string" ||
      typeof o.privateKey !== "string" ||
      typeof o.pubkey !== "string" ||
      typeof o.moqUrl !== "string" ||
      !isLocale(o.locale) ||
      typeof o.rounds !== "number" ||
      typeof o.limitSec !== "number" ||
      !Number.isInteger(o.seq) ||
      (o.gmPid !== undefined && typeof o.gmPid !== "string")
    ) {
      return null;
    }
    const pending = o.pending as Partial<PendingStep> | undefined;
    if (pending !== undefined && pending?.kind !== "claim" && pending?.kind !== "rejoin")
      return null;
    return o as Me;
  } catch {
    return null;
  }
}

export function clearMe(code: string): void {
  try {
    sessionStorage.removeItem(keyOf(code));
  } catch {
    // 消せなくても、トップに戻れば新しく入り直せる。
  }
}

async function newKeys(): Promise<{ pubkey: string; privateKey: string }> {
  const kp = await generateKeyPair();
  return {
    pubkey: await exportPublicKey(kp.publicKey),
    privateKey: await exportPrivateKey(kp.privateKey),
  };
}

const toMe = (j: Joined, keys: { pubkey: string; privateKey: string }): Me => ({
  code: j.code,
  pid: j.pid,
  name: j.cert.body.name,
  role: j.cert.body.role,
  roomToken: j.roomToken,
  cert: j.cert,
  privateKey: keys.privateKey,
  pubkey: keys.pubkey,
  moqUrl: j.moqUrl,
  locale: j.locale,
  rounds: j.rounds,
  limitSec: j.limitSec,
  seq: 0,
  gmPid: j.gmPid,
});

/** このタブで、あると確かめた部屋の番号。名前の入力はこの部屋にだけ出す。 */
const foundRooms = new Set<string>();

/** 部屋があるか確かめ、あれば覚えておく。無ければ（数秒待ち直しても 404 なら）投げる。 */
export async function findRoom(
  code: string,
  api: Pick<typeof import("../api"), "checkRoom"> = { checkRoom },
): Promise<void> {
  await api.checkRoom(code);
  foundRooms.add(code);
}

export const isRoomFound = (code: string): boolean => foundRooms.has(code);

const NAME_KEY = "sh:name";

/** 前に使った名前（入力の初期値にするだけの便利機能）。読めなければ空。 */
export function loadLastName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveLastName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // 覚えられなくても、次に入れ直せばよい。
  }
}

/** 部屋を作って GM として保存し、部屋の番号を返す。 */
export async function createAndSave(
  name: string,
  locale: Locale,
  api: Pick<typeof import("../api"), "createRoom"> = { createRoom },
): Promise<string> {
  const keys = await newKeys();
  const joined = await api.createRoom({ name, pubkey: keys.pubkey, locale });
  saveMe(toMe(joined, keys));
  return joined.code;
}

/** 部屋に入ってプレイヤーとして保存する。部屋がまだ見えない間は onWaiting を呼びながら待つ。 */
export async function joinAndSave(
  code: string,
  name: string,
  opts: { onWaiting?: () => void } = {},
  api: Pick<typeof import("../api"), "joinRoom"> = { joinRoom },
): Promise<Me> {
  const keys = await newKeys();
  const joined = await api.joinRoom(
    code,
    { name, pubkey: keys.pubkey },
    { onWaiting: opts.onWaiting },
  );
  const me = toMe(joined, keys);
  saveMe(me);
  return me;
}

const statusOf = (e: unknown): number | undefined =>
  e instanceof Error ? (e as { status?: number }).status : undefined;

/** やり直しても変わらない失敗（部屋が無い、トークンや交代証が通らない）。 */
const isPermanent = (e: unknown): boolean => {
  const status = statusOf(e);
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
};

export interface RetryDeps {
  sleep(ms: number): Promise<void>;
  /** UNIX 秒。 */
  nowSec(): number;
}

const defaultRetry: RetryDeps = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  nowSec: () => Math.floor(Date.now() / 1000),
};

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

/**
 * 交代証で GM の参加証を取り直す。通信の失敗は間隔を伸ばしながら交代証の期限までやり直す。
 * やり直しても通らない失敗か期限切れなら null。
 */
export async function claimUntilDone(
  me: Me,
  step: Extract<PendingStep, { kind: "claim" }>,
  opts: { claim?: typeof claim; retry?: RetryDeps; stopped?: () => boolean } = {},
): Promise<Me | null> {
  const doClaim = opts.claim ?? claim;
  const { sleep, nowSec } = opts.retry ?? defaultRetry;
  for (let delay = MIN_RETRY_MS; !opts.stopped?.() && nowSec() < step.transfer.body.exp;) {
    try {
      const { roomToken, cert } = await doClaim(me.code, me.roomToken, {
        transfer: step.transfer,
        pubkey: me.pubkey,
        name: me.name,
      });
      return { ...me, role: "gm", roomToken, cert, pending: undefined };
    } catch (e) {
      console.warn("GM の参加証を取り直せなかった", e);
      if (isPermanent(e)) return null;
      await sleep(delay);
      delay = Math.min(delay * 2, MAX_RETRY_MS);
    }
  }
  return null;
}

/**
 * GM を渡した後、新しい鍵でプレイヤーとして入り直す。通信の失敗は間隔を伸ばしながらやり直す。
 * 部屋が無いなど、やり直しても通らない失敗なら null。
 */
export async function rejoinUntilDone(
  me: Me,
  opts: { join?: typeof joinRoom; retry?: RetryDeps; stopped?: () => boolean } = {},
): Promise<Me | null> {
  const { sleep } = opts.retry ?? defaultRetry;
  for (let delay = MIN_RETRY_MS; !opts.stopped?.();) {
    try {
      return await joinAndSave(me.code, me.name, {}, { joinRoom: opts.join ?? joinRoom });
    } catch (e) {
      console.warn("プレイヤーとして入り直せなかった", e);
      if (isPermanent(e)) return null;
      await sleep(delay);
      delay = Math.min(delay * 2, MAX_RETRY_MS);
    }
  }
  return null;
}

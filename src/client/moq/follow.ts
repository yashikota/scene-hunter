import * as v from 'valibot';
import type { Envelope, EnvelopeVerifier } from '../../shared/envelope';
import {
  GmEventSchema,
  GmSnapshotSchema,
  type GmEvent,
  type GmSnapshot,
} from '../../shared/protocol';
import { EVENTS_TRACK, GM_PREFIX, gmPath, STATE_TRACK } from './paths';
import { keepSubscribed, type MoqSession } from './session';

// プレイヤーが `gm/{epoch}` を追いかける。動きは poc/moq-verify/client.ts の follow をもとにする：
// - 乗り換え先を探す購読（watch）は最大 2 本：announce なしの current + 1 と、
//   announce で見つけた current より大きい最大の epoch。
//   （Relay は announce を配り損ねることがあるため、announce なしの探りも併用する）
// - まだ GM を見つけていない間（current < 0）は、epoch 1〜5 を順に announce なしで探る。
// - 購読が終わったら（`Track not found` など）500ms → 2s のバックオフでやり直す。
// - 新しい epoch には、verifier.open を通り、送り主が isGm を満たし、body.epoch がそのパスの epoch と
//   一致するフレームを受けたときだけ乗り換える。盗んだ GM のフレームを別の epoch に流し直しても従わない。
// - 署名者（GM の pid）ごとに event と snapshot の最後の seq を覚え、seq が増えていないものは捨てる
//   （再購読で開いたグループが最初から届き直すため）。同じ GM なら epoch をまたいでも続ける。
// - announce で見つけた epoch の最初のフレームが検証に落ちたら、その枠を空けて次の announce を待つ。

export interface GmFollowHandlers {
  event(e: GmEvent): void;
  snapshot(s: GmSnapshot): void;
  epoch(n: number): void;
}

/** 1 つの epoch（初期の探りでは探している epoch が変わる）を見る購読。 */
interface Watch {
  epoch: number;
  stopped: boolean;
  stops: Array<() => void>;
  /** 乗り換え前のフレームを受け付けなかったとき（初期の探りは次の epoch へ進む）。 */
  reject?(): void;
}

const FIRST_EPOCH = 1;
const INITIAL_PROBE_EPOCHS = 5;
const MIN_DELAY_MS = 500;
const MAX_DELAY_MS = 2000;
const EPOCH_RE = /^[0-9]+$/;

const decoder = new TextDecoder();

export function followGm(
  session: MoqSession,
  verifier: EnvelopeVerifier,
  isGm: (pid: string) => boolean,
  on: GmFollowHandlers,
): () => void {
  let current = -1;
  let stopped = false;
  /** 署名者（GM の pid）ごとに、最後に受け付けた event と snapshot の seq。GM を交代すると seq は 0 から数え直すため。 */
  const lastSeq = new Map<string, { event: number; snapshot: number }>();
  /** announce で見つけたが、最初のフレームが検証に落ちた epoch。announce し直されても見に行かない。 */
  const rejected = new Set<number>();
  /** 乗り換え済みの epoch の state と events。 */
  let adopted: Watch | undefined;
  /** current + 1（current < 0 の間は epoch 1〜5 を順に探る）。 */
  let next: Watch | undefined;
  /** announce で見つけた、current より大きい最大の epoch。 */
  let announced: Watch | undefined;
  /** 検証は非同期なので、届いた順に 1 つずつ処理する。 */
  let queue = Promise.resolve();

  const makeWatch = (epoch: number): Watch => ({ epoch, stopped: false, stops: [] });
  const stop = (w: Watch | undefined) => {
    if (!w) return;
    w.stopped = true;
    for (const s of w.stops.splice(0)) s();
  };

  const watchEpoch = (epoch: number, blind: boolean): Watch => {
    const w = makeWatch(epoch);
    w.stops.push(
      keepSubscribed(session, gmPath(epoch), STATE_TRACK, (b) => receive(w, epoch, b), { blind }),
    );
    return w;
  };

  /** current < 0 の間、epoch 1〜5 を 1 本ずつ announce なしで探る。 */
  const initialProbe = (): Watch => {
    const w = makeWatch(FIRST_EPOCH);
    let k = 0;
    let delay = MIN_DELAY_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let off: (() => void) | undefined;
    const attempt = () => {
      if (w.stopped) return;
      const epoch = FIRST_EPOCH + (k++ % INITIAL_PROBE_EPOCHS);
      w.epoch = epoch;
      off = session.subscribe(gmPath(epoch), STATE_TRACK, (b) => receive(w, epoch, b), {
        blind: true,
        onEnd: () => {
          off = undefined;
          moveOn();
        },
      });
    };
    const moveOn = () => {
      if (w.stopped) return;
      timer = setTimeout(attempt, delay);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    };
    w.reject = () => {
      if (!off) return;
      off();
      off = undefined;
      moveOn();
    };
    w.stops.push(() => {
      clearTimeout(timer);
      off?.();
    });
    attempt();
    return w;
  };

  const receive = (w: Watch, epoch: number, bytes: Uint8Array) => {
    queue = queue.then(async () => {
      if (stopped || w.stopped || epoch < current) return;
      let env: Envelope<{ pid: string; epoch?: unknown }>;
      try {
        env = JSON.parse(decoder.decode(bytes));
      } catch {
        return;
      }
      const opened = await verifier.open(env);
      if (stopped || w.stopped || epoch < current) return;
      if (!opened || !isGm(opened.body.pid) || opened.body.epoch !== epoch) {
        if (epoch > current) w.reject?.();
        return;
      }
      if (epoch > current) adopt(epoch);
      deliver(opened.body);
    });
  };

  const adopt = (epoch: number) => {
    current = epoch;
    stop(adopted);
    stop(next);
    // announce で見つけた epoch がまだ先（epoch + 2 以上）なら残す
    if (announced && announced.epoch <= epoch + 1) {
      stop(announced);
      announced = undefined;
    }
    // 乗り換えのきっかけになったフレームは deliver する。state を購読し直して届く同じ snapshot は seq で捨てる。
    adopted = makeWatch(epoch);
    const w = adopted;
    w.stops.push(
      keepSubscribed(session, gmPath(epoch), STATE_TRACK, (b) => receive(w, epoch, b), {
        blind: true,
      }),
      keepSubscribed(session, gmPath(epoch), EVENTS_TRACK, (b) => receive(w, epoch, b), {
        blind: true,
      }),
    );
    on.epoch(epoch);
    next = watchEpoch(epoch + 1, true);
  };

  const deliver = (body: { pid: string; type?: unknown }) => {
    let last = lastSeq.get(body.pid);
    if (!last) lastSeq.set(body.pid, (last = { event: -1, snapshot: -1 }));
    if (body.type === 'snapshot') {
      const r = v.safeParse(GmSnapshotSchema, body);
      if (!r.success || r.output.seq <= last.snapshot) return;
      last.snapshot = r.output.seq;
      on.snapshot(r.output);
    } else {
      const r = v.safeParse(GmEventSchema, body);
      if (!r.success || r.output.seq <= last.event) return;
      last.event = r.output.seq;
      on.event(r.output);
    }
  };

  const offAnnounce = session.announced((path, active) => {
    if (stopped || !active || !path.startsWith(GM_PREFIX)) return;
    const rest = path.slice(GM_PREFIX.length);
    if (!EPOCH_RE.test(rest)) return;
    const epoch = Number(rest);
    if (!Number.isSafeInteger(epoch) || epoch < FIRST_EPOCH || epoch <= current) return;
    if (current >= 0 && epoch === current + 1) return; // next が announce なしで見ている
    if (rejected.has(epoch) || (announced && announced.epoch >= epoch)) return;
    stop(announced);
    const w = watchEpoch(epoch, false);
    // 検証に落ちたら枠を空け、次に来る announce を受け付けられるようにする（偽の gm/999999 で埋まらないように）
    w.reject = () => {
      rejected.add(epoch);
      stop(w);
      if (announced === w) announced = undefined;
    };
    announced = w;
  });

  next = initialProbe();

  return () => {
    stopped = true;
    offAnnounce();
    for (const w of [adopted, next, announced]) stop(w);
  };
}

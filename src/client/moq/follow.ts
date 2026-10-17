import * as v from 'valibot';
import type { Envelope, EnvelopeVerifier } from '../../shared/envelope';
import { GmEventSchema, GmSnapshotSchema, type GmEvent, type GmSnapshot } from '../../shared/protocol';
import { EVENTS_TRACK, GM_PREFIX, gmPath, STATE_TRACK } from './paths';
import { keepSubscribed, type MoqSession } from './session';

// プレイヤーが `gm/{epoch}` を追いかける。動きは poc/moq-verify/client.ts の follow と同じ：
// - announce で見つけた epoch と、いまの epoch + 1（announce なし）を購読しにいく
//   （Relay は announce を配り損ねることがあるため）。終わったら 500ms → 2s のバックオフでやり直す。
// - 違いは、新しい epoch の最初のフレームを verifier.open し、送り主が isGm を満たすときだけ乗り換えること。
//   ほかの人が先回りして gm/{epoch + 1} に publish しても従わない。
// まず state を購読し、乗り換えたら events も購読する。

export interface GmFollowHandlers {
  event(e: GmEvent): void;
  snapshot(s: GmSnapshot): void;
  epoch(n: number): void;
}

interface Watch {
  stops: Array<() => void>;
  /** フレームの検証は非同期なので、届いた順に処理するための列。 */
  queue: Promise<void>;
}

const decoder = new TextDecoder();

export function followGm(
  session: MoqSession,
  verifier: EnvelopeVerifier,
  isGm: (pid: string) => boolean,
  on: GmFollowHandlers,
): () => void {
  let current = -1;
  let stopped = false;
  const watches = new Map<number, Watch>();

  const watch = (epoch: number, blind: boolean) => {
    if (stopped || epoch <= current || watches.has(epoch)) return;
    const w: Watch = { stops: [], queue: Promise.resolve() };
    watches.set(epoch, w);
    w.stops.push(keepSubscribed(session, gmPath(epoch), STATE_TRACK, (b) => receive(epoch, w, b), { blind }));
  };

  const receive = (epoch: number, w: Watch, bytes: Uint8Array) => {
    w.queue = w.queue.then(async () => {
      if (stopped || epoch < current) return;
      let env: Envelope<{ pid: string }>;
      try {
        env = JSON.parse(decoder.decode(bytes));
      } catch {
        return;
      }
      const opened = await verifier.open(env);
      if (!opened || !isGm(opened.body.pid)) return;
      if (stopped || epoch < current) return;
      if (epoch > current) adopt(epoch, w);
      deliver(opened.body);
    });
  };

  const adopt = (epoch: number, w: Watch) => {
    current = epoch;
    for (const [e, old] of watches) {
      if (e >= epoch) continue;
      for (const stop of old.stops) stop();
      watches.delete(e);
    }
    w.stops.push(keepSubscribed(session, gmPath(epoch), EVENTS_TRACK, (b) => receive(epoch, w, b), { blind: true }));
    on.epoch(epoch);
    watch(epoch + 1, true);
  };

  const deliver = (body: { pid: string; type?: unknown }) => {
    if (body.type === 'snapshot') {
      const r = v.safeParse(GmSnapshotSchema, body);
      if (r.success) on.snapshot(r.output);
    } else {
      const r = v.safeParse(GmEventSchema, body);
      if (r.success) on.event(r.output);
    }
  };

  const offAnnounce = session.announced((path, active) => {
    if (!active || !path.startsWith(GM_PREFIX)) return;
    const epoch = Number(path.slice(GM_PREFIX.length));
    if (Number.isSafeInteger(epoch) && epoch >= 0) watch(epoch, false);
  });

  return () => {
    stopped = true;
    offAnnounce();
    for (const w of watches.values()) for (const stop of w.stops) stop();
    watches.clear();
  };
}

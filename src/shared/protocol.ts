import * as v from 'valibot';
import { LOCALES } from './locales';

// MoQ の封筒（envelope.ts）の body に入るイベントのスキーマ。
// 受け取った側は v.safeParse で形を確かめてから使う。

const pid = v.string();
const round = v.pipe(v.number(), v.integer(), v.minValue(1));
const nonNegInt = v.pipe(v.number(), v.integer(), v.minValue(0));

export const PhaseSchema = v.picklist([
  'lobby',
  'gmTurn',
  'hinting',
  'hintError',
  'playerTurn',
  'picking',
  'reveal',
  'final',
]);
export type Phase = v.InferOutput<typeof PhaseSchema>;

export const LobbyPlayerSchema = v.object({ pid, name: v.string(), label: v.string() });
export type LobbyPlayer = v.InferOutput<typeof LobbyPlayerSchema>;

export const RoundScoreSchema = v.object({
  pid,
  rank: v.nullable(v.union([v.literal(1), v.literal(2), v.literal(3)])),
  tMs: v.nullable(v.number()),
  multiplier: v.nullable(v.number()),
  points: v.number(),
  bonus: v.number(),
  streak: nonNegInt,
});

export const TotalSchema = v.object({
  pid,
  total: v.number(),
  rank: v.pipe(v.number(), v.integer(), v.minValue(1)),
  delta: v.pipe(v.number(), v.integer()),
});
export type Total = v.InferOutput<typeof TotalSchema>;

export const ResultPhotoSchema = v.object({ pid, url: v.string(), valid: v.boolean() });

const TransferCertSchema = v.object({
  body: v.object({
    room: v.string(),
    from: v.string(),
    to: v.string(),
    iat: v.number(),
    exp: v.number(),
  }),
  sig: v.string(),
});

// epoch は送ったパス gm/{epoch} の epoch。別の epoch に流し直したフレームを受け手が捨てるために入れる。
const epoch = v.pipe(v.number(), v.integer(), v.minValue(1));
const gm = { pid, seq: nonNegInt, epoch };

export const GmEventSchema = v.variant('type', [
  v.object({
    ...gm,
    type: v.literal('lobby'),
    players: v.array(LobbyPlayerSchema),
    gmPid: pid,
    locale: v.picklist(LOCALES),
    rounds: round,
    limitSec: v.number(),
  }),
  v.object({ ...gm, type: v.literal('gm_turn'), round, gameId: v.string() }),
  v.object({ ...gm, type: v.literal('hinting') }),
  v.object({ ...gm, type: v.literal('hint_error') }),
  v.object({ ...gm, type: v.literal('player_turn'), round, limitSec: v.number() }),
  v.object({
    ...gm,
    type: v.literal('hint'),
    round,
    index: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(4)),
    text: v.string(),
  }),
  v.object({ ...gm, type: v.literal('picking'), round }),
  v.object({ ...gm, type: v.literal('submitted'), pids: v.array(pid) }),
  v.object({
    ...gm,
    type: v.literal('results'),
    round,
    gmPhotoUrl: v.string(),
    photos: v.array(ResultPhotoSchema),
  }),
  v.object({
    ...gm,
    type: v.literal('ranking'),
    round,
    scores: v.array(RoundScoreSchema),
    totals: v.array(TotalSchema),
  }),
  v.object({ ...gm, type: v.literal('final'), totals: v.array(TotalSchema) }),
  v.object({ ...gm, type: v.literal('transfer'), transfer: TransferCertSchema }),
  v.object({ ...gm, type: v.literal('dissolved') }),
]);
export type GmEvent = v.InferOutput<typeof GmEventSchema>;

/** union の各要素から pid、seq、epoch を外す（送信側が付ける前の本体）。 */
export type GmEventBody = WithoutHeader<GmEvent>;
type WithoutHeader<E> = E extends unknown ? Omit<E, 'pid' | 'seq' | 'epoch'> : never;

/** `state` Track に流す丸ごとの状態。途中参加と再同期に使う。 */
export const GmSnapshotSchema = v.object({
  ...gm,
  type: v.literal('snapshot'),
  /**
   * このスナップショットに反映済みの最後のイベントの seq（まだ 1 つも送っていなければ -1）。
   * seq はスナップショットどうしの通し番号で、イベントの seq とは別に数えるので、
   * 受け手はイベントの取りこぼしの判定（lastSeq）をこちらに合わせる。
   */
  lastEventSeq: v.pipe(v.number(), v.integer(), v.minValue(-1)),
  phase: PhaseSchema,
  round: nonNegInt,
  rounds: round,
  limitSec: v.number(),
  locale: v.picklist(LOCALES),
  players: v.array(LobbyPlayerSchema),
  gmPid: pid,
  gameId: v.nullable(v.string()),
  /** 出したヒントだけ。 */
  hints: v.array(v.string()),
  /** playerTurn のときだけ、ターン開始からの経過ミリ秒。 */
  turnElapsedMs: v.nullable(v.number()),
  submitted: v.array(pid),
  results: v.nullable(v.object({ gmPhotoUrl: v.string(), photos: v.array(ResultPhotoSchema) })),
  /** 直近の ranking。round でどのラウンドの結果か分かる。 */
  ranking: v.nullable(
    v.object({ round, scores: v.array(RoundScoreSchema), totals: v.array(TotalSchema) }),
  ),
  final: v.nullable(v.array(TotalSchema)),
});
export type GmSnapshot = v.InferOutput<typeof GmSnapshotSchema>;

// seq は送信者ごとに単調に増やす。受け手（GmInbox）は seq が増えていないフレームを重複として捨てる。
const player = { pid, seq: nonNegInt };

export const PlayerEventSchema = v.variant('type', [
  v.object({ ...player, type: v.literal('join'), name: v.string() }),
  v.object({ ...player, type: v.literal('shutter'), round, hash: v.string() }),
  v.object({ ...player, type: v.literal('submit'), round, key: v.string() }),
  v.object({ ...player, type: v.literal('resync') }),
]);
export type PlayerEvent = v.InferOutput<typeof PlayerEventSchema>;

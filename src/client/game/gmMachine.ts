import type { TransferCert } from '../../shared/cert';
import type { Locale } from '../../shared/locales';
import type { GmEventBody, GmSnapshot, LobbyPlayer, Phase, Total } from '../../shared/protocol';
import { scoreRound, type RoundScore } from '../../shared/scoring';

export type { Phase } from '../../shared/protocol';

/** ヒントの数と、ヒントを 1 つずつ出す間隔。 */
const HINT_COUNT = 5;
const HINT_INTERVAL_MS = 10_000;
/** shutter からこの時間内に submit が無ければ、その提出は無効。 */
const SUBMIT_WINDOW_MS = 30_000;
const MAX_PICKS = 3;

const PHASE_ORDER: readonly Phase[] = [
  'lobby',
  'gmTurn',
  'hinting',
  'hintError',
  'playerTurn',
  'picking',
  'reveal',
  'final',
];

export interface GmPlayer {
  name: string;
  /** 同じ名前の人と区別するための表示名（例：「はるか (2)」）。 */
  label: string;
  joinedAt: { round: number; phase: Phase };
  total: number;
  streak: number;
  /** しばらくメッセージが届いていない（GmEngine が決める）。全員提出の判定と未提出の一覧から外す。得点は残す。 */
  away?: boolean;
}

export interface GmState {
  room: string;
  gmPid: string;
  locale: Locale;
  rounds: number;
  limitSec: number;
  phase: Phase;
  /** ロビーでは 0、ゲーム中は 1〜rounds。 */
  round: number;
  gameId: string | null;
  players: Record<string, GmPlayer>;
  /**
   * 部屋を出た pid。以後この pid のメッセージはすべて無視する（保存が古ければ無い）。
   * ロビーで出た人は players からも消す。ゲームの途中で出た人は、それまでの得点で順位に残すため players に残す。
   */
  left?: string[];
  gmPhotoKey: string | null;
  /** player_turn を送った時刻（GM の時計）。撮影秒数 t の起点。 */
  turnStartedAt: number | null;
  hints: string[];
  hintsSent: number;
  shutters: Record<string, { at: number; hash: string }>;
  submissions: Record<string, { key: string; at: number }>;
  photoValid: Record<string, boolean>;
  picks: string[];
  results: { gmPhotoUrl: string; photos: { pid: string; url: string; valid: boolean }[] } | null;
  lastRanking: { round: number; scores: RoundScore[]; totals: Total[] } | null;
  /** 解散したら true。以後のアクションはすべて無視する。 */
  dissolved: boolean;
  /** 送信側が使う通し番号。gmReduce は触らない。 */
  seq: number;
}

export type GmAction =
  | { type: 'playerJoined'; pid: string; name: string; at: number }
  /** プレイヤーが部屋を出た（署名つきの leave を受けた）。 */
  | { type: 'playerLeft'; pid: string }
  /** メッセージが途切れた（active: false）か、また届いた（active: true）。 */
  | { type: 'presence'; pid: string; active: boolean }
  | { type: 'start'; gameId: string }
  | { type: 'gmPhotoUploaded'; key: string }
  | { type: 'hintsReady'; hints: string[]; at: number }
  | { type: 'hintsFailed' }
  | { type: 'retryHints' }
  | { type: 'tick'; now: number }
  | { type: 'shutter'; round: number; pid: string; hash: string; at: number }
  | { type: 'submit'; round: number; pid: string; key: string; at: number }
  | { type: 'photoChecked'; pid: string; valid: boolean }
  | { type: 'resultsReady'; gmPhotoUrl: string; photos: { pid: string; url: string }[] }
  | { type: 'togglePick'; pid: string }
  | { type: 'confirmPicks' }
  | { type: 'nextRound' }
  | { type: 'backToLobby' }
  | { type: 'transferred'; transfer: TransferCert }
  | { type: 'dissolve' };

export interface GmStep {
  state: GmState;
  emit: GmEventBody[];
}

const freshRound = {
  gmPhotoKey: null,
  turnStartedAt: null,
  hints: [],
  hintsSent: 0,
  shutters: {},
  submissions: {},
  photoValid: {},
  picks: [],
  results: null,
} satisfies Partial<GmState>;

export function initialGmState(input: {
  room: string;
  gmPid: string;
  locale: Locale;
  rounds: number;
  limitSec: number;
}): GmState {
  return {
    ...input,
    phase: 'lobby',
    round: 0,
    gameId: null,
    players: {},
    left: [],
    ...freshRound,
    lastRanking: null,
    dissolved: false,
    seq: 0,
  };
}

/** pid は外から来る文字列なので、`__proto__` などでプロトタイプを引かないよう自前のキーだけを見る。 */
const own = <T>(rec: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(rec, key) ? rec[key] : undefined;

export const hasLeft = (s: GmState, pid: string): boolean => (s.left ?? []).includes(pid);

const lobbyPlayers = (s: GmState): LobbyPlayer[] =>
  Object.entries(s.players).map(([pid, p]) => ({
    pid,
    name: p.name,
    label: p.label,
    ...(p.away ? { away: true } : {}),
    ...(hasLeft(s, pid) ? { left: true } : {}),
  }));

const lobbyEvent = (s: GmState): GmEventBody => ({
  type: 'lobby',
  players: lobbyPlayers(s),
  gmPid: s.gmPid,
  locale: s.locale,
  rounds: s.rounds,
  limitSec: s.limitSec,
});

function uniqueLabel(players: Record<string, GmPlayer>, name: string): string {
  const taken = new Set(Object.values(players).map((p) => p.label));
  for (let n = 1; ; n++) {
    const label = n === 1 ? name : `${name} (${n})`;
    if (!taken.has(label)) return label;
  }
}

/** プレイヤーのターンが始まる前に入った人だけが、そのラウンドに提出できる。 */
export function isEligible(p: GmPlayer, round: number): boolean {
  const { joinedAt } = p;
  if (joinedAt.round !== round) return joinedAt.round < round;
  return PHASE_ORDER.indexOf(joinedAt.phase) < PHASE_ORDER.indexOf('playerTurn');
}

export const eligiblePids = (s: GmState): string[] =>
  Object.entries(s.players)
    .filter(([, p]) => isEligible(p, s.round))
    .map(([pid]) => pid);

/** そのラウンドの対象者のうち、away でない人。全員提出の判定と未提出の一覧に使う。 */
export const activeEligiblePids = (s: GmState): string[] =>
  eligiblePids(s).filter((pid) => !own(s.players, pid)!.away && !hasLeft(s, pid));

/** 対象者のうち away でない人が 1 人以上いて、その全員が提出していれば true。 */
const allSubmitted = (s: GmState, submissions: GmState['submissions']): boolean => {
  const active = activeEligiblePids(s);
  return active.length > 0 && active.every((pid) => own(submissions, pid));
};

/** playerTurn で、人が抜けた結果ほかの全員が提出済みになったら picking に進める。 */
function endTurnIfAllIn(s: GmState, emit: GmEventBody[]): GmStep {
  if (s.phase !== 'playerTurn' || !allSubmitted(s, s.submissions)) return { state: s, emit };
  return {
    state: { ...s, phase: 'picking' },
    emit: [...emit, { type: 'picking', round: s.round }],
  };
}

const without = <T>(rec: Record<string, T>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(rec).filter(([k]) => k !== key));

const hasValidSubmission = (s: GmState, pid: string): boolean =>
  own(s.submissions, pid) !== undefined && own(s.photoValid, pid) !== false;

/** 写真 API が発行するキーの先頭（rooms/{room}/{gameId}/{round}/{pid}-）。 */
const photoKeyPrefix = (s: GmState, pid: string): string =>
  `rooms/${s.room}/${s.gameId}/${s.round}/${pid}-`;

/** 文字列の 32 ビットのハッシュ（FNV-1a）。並べ替えの鍵にだけ使う。 */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 結果の写真の並び。提出の順のままだと、選ぶ画面で誰が速かったかが分かり、速さで選びがぶれる。
 * ゲームとラウンドごとに混ぜ、同じラウンドの送り直し（判定の更新、退出）では並びを変えない。
 */
const shuffleKey = (s: GmState, pid: string): number => hash32(`${s.gameId}:${s.round}:${pid}`);

/** 今の提出と photoValid から results を作り直す。 */
const resultsOf = (s: GmState, gmPhotoUrl: string, photos: { pid: string; url: string }[]) => ({
  gmPhotoUrl,
  photos: photos
    .filter((ph) => own(s.submissions, ph.pid))
    .map((ph) => ({ pid: ph.pid, url: ph.url, valid: own(s.photoValid, ph.pid) !== false }))
    .sort((a, b) => shuffleKey(s, a.pid) - shuffleKey(s, b.pid) || (a.pid < b.pid ? -1 : 1)),
});

/** 合計の降順に並べ、同点は同じ順位にする。delta は前回の順位 − 今回の順位。 */
function rankTotals(players: Record<string, GmPlayer>, prev: Total[] | undefined): Total[] {
  const prevRank = new Map(prev?.map((t) => [t.pid, t.rank]));
  const sorted = Object.entries(players)
    .map(([pid, p]) => ({ pid, total: p.total }))
    .sort((a, b) => b.total - a.total);
  return sorted.map((t) => {
    const rank = sorted.findIndex((x) => x.total === t.total) + 1;
    const before = prevRank.get(t.pid);
    return { ...t, rank, delta: before === undefined ? 0 : before - rank };
  });
}

function emitDueHints(s: GmState, now: number): GmStep {
  const elapsed = now - (s.turnStartedAt ?? now);
  const emit: GmEventBody[] = [];
  let sent = s.hintsSent;
  while (sent < HINT_COUNT && elapsed >= sent * HINT_INTERVAL_MS) {
    emit.push({ type: 'hint', round: s.round, index: sent, text: s.hints[sent] ?? '' });
    sent++;
  }
  return { state: sent === s.hintsSent ? s : { ...s, hintsSent: sent }, emit };
}

export function gmReduce(state: GmState, action: GmAction): GmStep {
  const s = state;
  const none: GmStep = { state: s, emit: [] };
  const limitMs = s.limitSec * 1000;
  if (s.dissolved) return none;

  switch (action.type) {
    case 'playerJoined': {
      if (action.pid === s.gmPid || own(s.players, action.pid) || hasLeft(s, action.pid))
        return none;
      const player: GmPlayer = {
        name: action.name,
        label: uniqueLabel(s.players, action.name),
        joinedAt: { round: s.round, phase: s.phase },
        total: 0,
        streak: 0,
      };
      const next = { ...s, players: { ...s.players, [action.pid]: player } };
      // ゲーム中の参加者の一覧は state Track のスナップショットで伝える。
      return { state: next, emit: s.phase === 'lobby' ? [lobbyEvent(next)] : [] };
    }

    case 'playerLeft': {
      const pid = action.pid;
      if (!own(s.players, pid) || hasLeft(s, pid)) return none;
      const left = [...(s.left ?? []), pid];
      if (s.phase === 'lobby') {
        // ロビーではまだ得点が無いので、一覧から消す。
        const next: GmState = { ...s, players: without(s.players, pid), left };
        return { state: next, emit: [lobbyEvent(next)] };
      }
      // ゲームの途中で出た人は、それまでの得点のまま順位に残る（点数は補填しない）。
      // 結果の画面（reveal / final）では何も変えない。
      if (s.phase !== 'playerTurn' && s.phase !== 'picking')
        return { state: { ...s, left }, emit: [] };
      // まだ得点になっていない、このラウンドの写真は取り下げる。
      let next: GmState = {
        ...s,
        left,
        shutters: without(s.shutters, pid),
        submissions: without(s.submissions, pid),
        photoValid: without(s.photoValid, pid),
        picks: s.picks.filter((p) => p !== pid),
      };
      const emit: GmEventBody[] = [];
      if (s.phase === 'picking' && s.results) {
        const results = resultsOf(next, s.results.gmPhotoUrl, s.results.photos);
        next = { ...next, results };
        emit.push({ type: 'results', round: s.round, ...results });
      }
      return endTurnIfAllIn(next, emit);
    }

    case 'presence': {
      const p = own(s.players, action.pid);
      if (!p || hasLeft(s, action.pid) || !p.away === action.active) return none;
      const players = { ...s.players, [action.pid]: { ...p, away: !action.active } };
      const next: GmState = { ...s, players };
      if (s.phase === 'lobby') return { state: next, emit: [lobbyEvent(next)] };
      return action.active ? { state: next, emit: [] } : endTurnIfAllIn(next, []);
    }

    case 'start': {
      if (s.phase !== 'lobby') return none;
      const next: GmState = {
        ...s,
        ...freshRound,
        phase: 'gmTurn',
        round: 1,
        gameId: action.gameId,
        lastRanking: null,
      };
      return { state: next, emit: [{ type: 'gm_turn', round: 1, gameId: action.gameId }] };
    }

    case 'gmPhotoUploaded':
      if (s.phase !== 'gmTurn') return none;
      return {
        state: { ...s, phase: 'hinting', gmPhotoKey: action.key },
        emit: [{ type: 'hinting' }],
      };

    case 'hintsFailed':
      if (s.phase !== 'hinting') return none;
      return { state: { ...s, phase: 'hintError' }, emit: [{ type: 'hint_error' }] };

    case 'retryHints':
      if (s.phase !== 'hintError') return none;
      return { state: { ...s, phase: 'hinting' }, emit: [{ type: 'hinting' }] };

    case 'hintsReady': {
      if (s.phase !== 'hinting') return none;
      if (action.hints.length !== HINT_COUNT) {
        return { state: { ...s, phase: 'hintError' }, emit: [{ type: 'hint_error' }] };
      }
      const next: GmState = {
        ...s,
        phase: 'playerTurn',
        hints: [...action.hints],
        hintsSent: 0,
        turnStartedAt: action.at,
      };
      const hints = emitDueHints(next, action.at);
      return {
        state: hints.state,
        emit: [{ type: 'player_turn', round: s.round, limitSec: s.limitSec }, ...hints.emit],
      };
    }

    case 'tick': {
      if (s.phase !== 'playerTurn' || s.turnStartedAt === null) return none;
      const hints = emitDueHints(s, action.now);
      const pastLimit = action.now - s.turnStartedAt > limitMs;
      // T を過ぎても、shutter 済みで 30 秒以内の提出待ちがある人は待つ。
      const waiting = activeEligiblePids(s).some((pid) => {
        const sh = own(s.shutters, pid);
        return sh && !own(s.submissions, pid) && action.now - sh.at <= SUBMIT_WINDOW_MS;
      });
      if (!pastLimit || waiting) return hints;
      return {
        state: { ...hints.state, phase: 'picking' },
        emit: [...hints.emit, { type: 'picking', round: s.round }],
      };
    }

    case 'shutter': {
      if (s.phase !== 'playerTurn' || s.turnStartedAt === null || action.round !== s.round)
        return none;
      const p = own(s.players, action.pid);
      if (!p || !isEligible(p, s.round) || hasLeft(s, action.pid) || own(s.shutters, action.pid))
        return none;
      if (action.at - s.turnStartedAt > limitMs) return none;
      const shutter = { at: action.at, hash: action.hash };
      return { state: { ...s, shutters: { ...s.shutters, [action.pid]: shutter } }, emit: [] };
    }

    case 'submit': {
      if (s.phase !== 'playerTurn' || action.round !== s.round) return none;
      const sh = own(s.shutters, action.pid);
      if (!sh || own(s.submissions, action.pid)) return none;
      if (action.at - sh.at > SUBMIT_WINDOW_MS) return none;
      if (!action.key.startsWith(photoKeyPrefix(s, action.pid))) return none;
      const submissions = { ...s.submissions, [action.pid]: { key: action.key, at: action.at } };
      const allIn = allSubmitted(s, submissions);
      return {
        state: { ...s, submissions, phase: allIn ? 'picking' : s.phase },
        emit: [
          { type: 'submitted', pids: Object.keys(submissions) },
          ...(allIn ? [{ type: 'picking' as const, round: s.round }] : []),
        ],
      };
    }

    case 'photoChecked': {
      if (s.phase !== 'picking') return none;
      const photoValid = { ...s.photoValid, [action.pid]: action.valid };
      const picks = action.valid ? s.picks : s.picks.filter((pid) => pid !== action.pid);
      const next: GmState = { ...s, photoValid, picks };
      if (!s.results) return { state: next, emit: [] };
      // results を送った後に判定が出たら、valid を直した results を送り直す。
      const results = resultsOf(next, s.results.gmPhotoUrl, s.results.photos);
      return {
        state: { ...next, results },
        emit: [{ type: 'results', round: s.round, ...results }],
      };
    }

    case 'resultsReady': {
      if (s.phase !== 'picking') return none;
      const results = resultsOf(s, action.gmPhotoUrl, action.photos);
      return { state: { ...s, results }, emit: [{ type: 'results', round: s.round, ...results }] };
    }

    case 'togglePick': {
      if (s.phase !== 'picking') return none;
      if (s.picks.includes(action.pid)) {
        return { state: { ...s, picks: s.picks.filter((pid) => pid !== action.pid) }, emit: [] };
      }
      if (s.picks.length >= MAX_PICKS || !hasValidSubmission(s, action.pid)) return none;
      return { state: { ...s, picks: [...s.picks, action.pid] }, emit: [] };
    }

    case 'confirmPicks': {
      if (s.phase !== 'picking' || s.turnStartedAt === null) return none;
      const participants = eligiblePids(s);
      const startedAt = s.turnStartedAt;
      // `obj[pid] = …` だと pid が __proto__ のときにプロトタイプを書き換えるので、fromEntries で作る。
      const prevStreak = Object.fromEntries(
        participants.map((pid) => [pid, own(s.players, pid)!.streak]),
      );
      const tMs = Object.fromEntries(
        participants
          .filter((pid) => hasValidSubmission(s, pid))
          .map((pid) => [pid, own(s.shutters, pid)!.at - startedAt]),
      );
      const scores = scoreRound({ picks: s.picks, tMs, limitMs, prevStreak, participants });
      let players = s.players;
      for (const sc of scores) {
        const p = own(players, sc.pid)!;
        players = {
          ...players,
          [sc.pid]: { ...p, total: p.total + sc.points + sc.bonus, streak: sc.streak },
        };
      }
      const totals = rankTotals(players, s.lastRanking?.totals);
      const lastRanking = { round: s.round, scores, totals };
      return {
        state: { ...s, players, phase: 'reveal', lastRanking },
        emit: [{ type: 'ranking', ...lastRanking }],
      };
    }

    case 'nextRound': {
      if (s.phase !== 'reveal') return none;
      if (s.round >= s.rounds) {
        const totals = s.lastRanking?.totals ?? rankTotals(s.players, undefined);
        return { state: { ...s, phase: 'final' }, emit: [{ type: 'final', totals }] };
      }
      const round = s.round + 1;
      return {
        state: { ...s, ...freshRound, phase: 'gmTurn', round },
        emit: [{ type: 'gm_turn', round, gameId: s.gameId ?? '' }],
      };
    }

    case 'backToLobby': {
      if (s.phase === 'lobby') return none;
      // 出た人と通信が切れている人は、ロビーの一覧には持ち越さない（切れていた人は戻れば join し直す）。
      const players: Record<string, GmPlayer> = Object.fromEntries(
        Object.entries(s.players)
          .filter(([pid, p]) => !p.away && !hasLeft(s, pid))
          .map(([pid, p]) => [
            pid,
            { ...p, total: 0, streak: 0, joinedAt: { round: 0, phase: 'lobby' as const } },
          ]),
      );
      const next: GmState = {
        ...s,
        ...freshRound,
        phase: 'lobby',
        round: 0,
        players,
        lastRanking: null,
      };
      return { state: next, emit: [lobbyEvent(next)] };
    }

    case 'transferred':
      if (s.phase !== 'lobby') return none;
      return { state: s, emit: [{ type: 'transfer', transfer: action.transfer }] };

    case 'dissolve':
      return { state: { ...s, dissolved: true }, emit: [{ type: 'dissolved' }] };
  }
}

/** `state` Track に流すスナップショット（pid、seq、epoch、lastEventSeq は送信側で付ける）。 */
export function snapshotOf(
  state: GmState,
  now: number,
): Omit<GmSnapshot, 'pid' | 'seq' | 'epoch' | 'lastEventSeq'> {
  const s = state;
  return {
    type: 'snapshot',
    phase: s.phase,
    round: s.round,
    rounds: s.rounds,
    limitSec: s.limitSec,
    locale: s.locale,
    players: lobbyPlayers(s),
    gmPid: s.gmPid,
    gameId: s.gameId,
    hints: s.hints.slice(0, s.hintsSent),
    turnElapsedMs:
      s.phase === 'playerTurn' && s.turnStartedAt !== null ? now - s.turnStartedAt : null,
    submitted: Object.keys(s.submissions),
    results: s.results,
    ranking: s.lastRanking,
    final: s.phase === 'final' ? (s.lastRanking?.totals ?? rankTotals(s.players, undefined)) : null,
  };
}

import type { Locale } from '../../shared/locales';
import type { GmEvent, GmSnapshot, LobbyPlayer, Total } from '../../shared/protocol';
import type { Phase } from './gmMachine';

// プレイヤーの画面に出すものを、検証済みの GM イベントとスナップショットから作る純粋な reducer。

type Results = NonNullable<GmSnapshot['results']>;
type Ranking = NonNullable<GmSnapshot['ranking']>;

export interface ViewPlayer {
  pid: string;
  label: string;
  total: number;
  /** 直近の ranking の順位。ranking がまだ届いていなければ null。 */
  rank: number | null;
  /** GM がしばらくこの人のメッセージを受け取っていない。人数や全員提出の数には入れない。 */
  away: boolean;
}

/** away でない人だけ（人数や「2 / 3 人」の数に使う）。 */
export const activePlayers = <P extends { away?: boolean }>(players: readonly P[]): P[] =>
  players.filter((p) => !p.away);

export interface PlayerView {
  phase: Phase | 'connecting' | 'disconnected' | 'dissolved';
  round: number;
  rounds: number;
  limitSec: number;
  locale: Locale;
  players: ViewPlayer[];
  gmPid: string;
  gameId: string | null;
  hints: string[];
  turnStartedLocalAt: number | null;
  submitted: string[];
  results: Results | null;
  ranking: Ranking | null;
  final: Total[] | null;
  lastSeq: number;
}

export function initialView(): PlayerView {
  return {
    phase: 'connecting',
    round: 0,
    rounds: 0,
    limitSec: 0,
    locale: 'ja',
    players: [],
    gmPid: '',
    gameId: null,
    hints: [],
    turnStartedLocalAt: null,
    submitted: [],
    results: null,
    ranking: null,
    final: null,
    lastSeq: -1,
  };
}

/** 取りこぼし（seq の飛び）があれば true。 */
export function hasGap(v: PlayerView, e: GmEvent): boolean {
  return e.seq > v.lastSeq + 1;
}

function withTotals(players: ViewPlayer[], totals: readonly Total[]): ViewPlayer[] {
  const byPid = new Map(totals.map((t) => [t.pid, t]));
  return players.map((p) => {
    const t = byPid.get(p.pid);
    return t ? { ...p, total: t.total, rank: t.rank } : p;
  });
}

function fromLobby(players: readonly LobbyPlayer[]): ViewPlayer[] {
  return players.map((p) => ({
    pid: p.pid,
    label: p.label,
    total: 0,
    rank: null,
    away: p.away ?? false,
  }));
}

export function applyEvent(v: PlayerView, e: GmEvent, localNow: number): PlayerView {
  if (e.seq <= v.lastSeq) return v;
  const next = reduce(v, e, localNow);
  return { ...next, lastSeq: e.seq };
}

function reduce(v: PlayerView, e: GmEvent, localNow: number): PlayerView {
  switch (e.type) {
    case 'lobby':
      // 新しいゲームの始まり。前のゲームの状態は持ち越さない。
      return {
        ...initialView(),
        phase: 'lobby',
        lastSeq: v.lastSeq,
        players: fromLobby(e.players),
        gmPid: e.gmPid,
        locale: e.locale,
        rounds: e.rounds,
        limitSec: e.limitSec,
      };
    case 'gm_turn':
      return {
        ...v,
        phase: 'gmTurn',
        round: e.round,
        gameId: e.gameId,
        hints: [],
        turnStartedLocalAt: null,
        submitted: [],
        results: null,
      };
    case 'hinting':
      return { ...v, phase: 'hinting' };
    case 'hint_error':
      return { ...v, phase: 'hintError' };
    case 'player_turn':
      return {
        ...v,
        phase: 'playerTurn',
        round: e.round,
        limitSec: e.limitSec,
        hints: [],
        turnStartedLocalAt: localNow,
        submitted: [],
        results: null,
      };
    case 'hint':
      // 古いラウンドのヒントと、すでにある index は取り込まない。
      if (e.round !== v.round || e.index !== v.hints.length) return v;
      return { ...v, hints: [...v.hints, e.text] };
    case 'picking':
      return e.round === v.round ? { ...v, phase: 'picking' } : v;
    case 'submitted':
      return { ...v, submitted: [...new Set([...v.submitted, ...e.pids])] };
    case 'results':
      return {
        ...v,
        phase: 'picking',
        round: e.round,
        results: { gmPhotoUrl: e.gmPhotoUrl, photos: e.photos },
      };
    case 'ranking':
      return {
        ...v,
        phase: 'reveal',
        round: e.round,
        ranking: { round: e.round, scores: e.scores, totals: e.totals },
        players: withTotals(v.players, e.totals),
      };
    case 'final':
      return {
        ...v,
        phase: 'final',
        final: e.totals,
        players: withTotals(v.players, e.totals),
      };
    case 'transfer':
      return v;
    case 'dissolved':
      return { ...v, phase: 'dissolved' };
  }
}

export function applySnapshot(v: PlayerView, s: GmSnapshot, localNow: number): PlayerView {
  const totals = s.final ?? s.ranking?.totals ?? [];
  return {
    ...v,
    phase: s.phase,
    round: s.round,
    rounds: s.rounds,
    limitSec: s.limitSec,
    locale: s.locale,
    players: withTotals(fromLobby(s.players), totals),
    gmPid: s.gmPid,
    gameId: s.gameId,
    hints: s.hints,
    turnStartedLocalAt: s.turnElapsedMs === null ? null : localNow - s.turnElapsedMs,
    submitted: s.submitted,
    results: s.results,
    ranking: s.ranking,
    final: s.final,
    lastSeq: s.lastEventSeq,
  };
}

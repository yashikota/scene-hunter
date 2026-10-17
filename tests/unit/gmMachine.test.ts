import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import * as v from 'valibot';
import {
  gmReduce,
  initialGmState,
  snapshotOf,
  type GmAction,
  type GmState,
} from '../../src/client/game/gmMachine';
import { loadGm, saveGm } from '../../src/client/game/gmPersist';
import { GmEventSchema, GmSnapshotSchema, PlayerEventSchema } from '../../src/shared/protocol';

const T = 60_000;
const HINTS = ['h0', 'h1', 'h2', 'h3', 'h4'];
const START = 1_000_000;

const init = (rounds = 3) =>
  initialGmState({ room: '123456', gmPid: 'gm', locale: 'ja', rounds, limitSec: 60 });

/** 複数のアクションを順に適用し、最後の状態と emit をすべて連結して返す。 */
const run = (state: GmState, ...actions: GmAction[]) => {
  let s = state;
  const emit: ReturnType<typeof gmReduce>['emit'] = [];
  for (const a of actions) {
    const r = gmReduce(s, a);
    s = r.state;
    emit.push(...r.emit);
  }
  return { state: s, emit };
};

const join = (pid: string, name = pid, at = 0): GmAction => ({
  type: 'playerJoined',
  pid,
  name,
  at,
});

/** a, b が参加済みで、ラウンド 1 のプレイヤーのターンが START に始まった状態。 */
const inPlayerTurn = (pids = ['a', 'b']) =>
  run(
    init(),
    ...pids.map((p) => join(p)),
    { type: 'start', gameId: 'game1' },
    { type: 'gmPhotoUploaded', key: 'gm.jpg' },
    { type: 'hintsReady', hints: HINTS, at: START },
  ).state;

/** 写真 API が発行する形のキー。 */
const keyOf = (pid: string, round = 1) => `rooms/123456/game1/${round}/${pid}-0123abcd.jpg`;

const shutterAndSubmit = (pid: string, dt: number, round = 1): GmAction[] => [
  { type: 'shutter', round, pid, hash: `hash-${pid}`, at: START + dt },
  { type: 'submit', round, pid, key: keyOf(pid, round), at: START + dt + 1000 },
];

/** a, b, c が提出し終えて picking に入った状態。 */
const inPicking = () =>
  run(
    inPlayerTurn(['a', 'b', 'c']),
    ...shutterAndSubmit('a', 6000),
    ...shutterAndSubmit('b', 12000),
    ...shutterAndSubmit('c', 30000),
  ).state;

describe('ターンの進行', () => {
  it('start → gmTurn, gmPhotoUploaded → hinting, hintsReady → playerTurn', () => {
    let r = run(init(), join('a'), { type: 'start', gameId: 'game1' });
    expect(r.state.phase).toBe('gmTurn');
    expect(r.state.round).toBe(1);
    expect(r.emit).toContainEqual({ type: 'gm_turn', round: 1, gameId: r.state.gameId });

    r = run(r.state, { type: 'gmPhotoUploaded', key: 'gm.jpg' });
    expect(r.state.phase).toBe('hinting');
    expect(r.emit).toEqual([{ type: 'hinting' }]);

    r = run(r.state, { type: 'hintsReady', hints: HINTS, at: START });
    expect(r.state.phase).toBe('playerTurn');
    expect(r.state.turnStartedAt).toBe(START);
    expect(r.emit).toEqual([
      { type: 'player_turn', round: 1, limitSec: 60 },
      { type: 'hint', round: 1, index: 0, text: 'h0' },
    ]);
  });

  it('tick で 10, 20, 30, 40 秒ごとにヒント 1〜4 を 1 回ずつ送る', () => {
    let s = inPlayerTurn();
    const hintIndexes: number[] = [];
    for (const dt of [5000, 10000, 10000, 19999, 20000, 30000, 30000, 40000, 50000, 59000]) {
      const r = gmReduce(s, { type: 'tick', now: START + dt });
      s = r.state;
      for (const e of r.emit) if (e.type === 'hint') hintIndexes.push(e.index);
    }
    expect(hintIndexes).toEqual([1, 2, 3, 4]);
    expect(s.phase).toBe('playerTurn');
  });

  it('飛ばした tick では溜まったヒントを順に送る', () => {
    const r = gmReduce(inPlayerTurn(), { type: 'tick', now: START + 25000 });
    expect(r.emit).toEqual([
      { type: 'hint', round: 1, index: 1, text: 'h1' },
      { type: 'hint', round: 1, index: 2, text: 'h2' },
    ]);
  });

  it('hintsFailed で hintError、retryHints で hinting', () => {
    let r = run(
      init(),
      join('a'),
      { type: 'start', gameId: 'game1' },
      { type: 'gmPhotoUploaded', key: 'k' },
    );
    r = run(r.state, { type: 'hintsFailed' });
    expect(r.state.phase).toBe('hintError');
    expect(r.emit).toEqual([{ type: 'hint_error' }]);
    r = run(r.state, { type: 'retryHints' });
    expect(r.state.phase).toBe('hinting');
    expect(r.emit).toEqual([{ type: 'hinting' }]);
  });

  it('ヒントが 5 つでない hintsReady は hintError に移り hint_error を emit する', () => {
    const r = run(
      init(),
      join('a'),
      { type: 'start', gameId: 'game1' },
      { type: 'gmPhotoUploaded', key: 'k' },
    );
    const r2 = gmReduce(r.state, { type: 'hintsReady', hints: ['x'], at: START });
    expect(r2.state.phase).toBe('hintError');
    expect(r2.emit).toEqual([{ type: 'hint_error' }]);
  });
});

describe('shutter と submit', () => {
  it('turnStartedAt + 6000 の shutter は t = 6000、同じ pid の 2 回目は無視', () => {
    let s = run(inPlayerTurn(), {
      type: 'shutter',
      round: 1,
      pid: 'a',
      hash: 'x',
      at: START + 6000,
    }).state;
    expect(s.shutters.a).toEqual({ at: START + 6000, hash: 'x' });
    s = run(s, { type: 'shutter', round: 1, pid: 'a', hash: 'y', at: START + 7000 }).state;
    expect(s.shutters.a).toEqual({ at: START + 6000, hash: 'x' });
  });

  it('turnStartedAt + 60001 の shutter は無視、+60000 は受け付ける', () => {
    const s = run(
      inPlayerTurn(),
      { type: 'shutter', round: 1, pid: 'a', hash: 'x', at: START + 60001 },
      { type: 'shutter', round: 1, pid: 'b', hash: 'y', at: START + 60000 },
    ).state;
    expect(s.shutters.a).toBeUndefined();
    expect(s.shutters.b).toBeDefined();
  });

  it('round が今のラウンドと違う shutter と submit は無視', () => {
    let s = run(inPlayerTurn(), {
      type: 'shutter',
      round: 2,
      pid: 'a',
      hash: 'x',
      at: START + 1000,
    }).state;
    expect(s.shutters.a).toBeUndefined();
    s = run(s, { type: 'shutter', round: 1, pid: 'a', hash: 'x', at: START + 1000 }).state;
    s = run(s, { type: 'submit', round: 2, pid: 'a', key: keyOf('a'), at: START + 2000 }).state;
    expect(s.submissions.a).toBeUndefined();
  });

  it('submit の key が rooms/{room}/{gameId}/{round}/{pid}- で始まらなければ無視', () => {
    let s = run(inPlayerTurn(), {
      type: 'shutter',
      round: 1,
      pid: 'a',
      hash: 'x',
      at: START + 1000,
    }).state;
    for (const key of [
      'a.jpg',
      keyOf('b'),
      keyOf('a', 2),
      'rooms/999999/game1/1/a-0123abcd.jpg',
      'rooms/123456/game2/1/a-0123abcd.jpg',
      'rooms/123456/game1/1/ab-0123abcd.jpg',
    ]) {
      s = run(s, { type: 'submit', round: 1, pid: 'a', key, at: START + 2000 }).state;
      expect(s.submissions.a).toBeUndefined();
    }
    s = run(s, { type: 'submit', round: 1, pid: 'a', key: keyOf('a'), at: START + 2000 }).state;
    expect(s.submissions.a).toBeDefined();
  });

  it('__proto__ などの pid でも Object のプロトタイプを players と取り違えない', () => {
    const s = inPlayerTurn();
    for (const pid of ['__proto__', 'constructor', 'toString']) {
      const r = gmReduce(s, { type: 'shutter', round: 1, pid, hash: 'x', at: START + 1000 });
      expect(r.state).toBe(s);
    }
    const j = run(init(), join('constructor', 'c'), join('toString', 't'));
    expect(Object.keys(j.state.players)).toEqual(['constructor', 'toString']);
    expect(j.state.players['toString']?.label).toBe('t');
  });

  it('pid が __proto__ のプレイヤーも 1 ラウンド通して普通に扱える', () => {
    const r = run(
      inPlayerTurn(['__proto__', 'b']),
      ...shutterAndSubmit('__proto__', 6000),
      ...shutterAndSubmit('b', 8000),
      { type: 'togglePick', pid: '__proto__' },
      { type: 'confirmPicks' },
      { type: 'nextRound' },
      { type: 'gmPhotoUploaded', key: 'k' },
      { type: 'hintsReady', hints: HINTS, at: START },
      { type: 'tick', now: START + T + 1 },
      { type: 'confirmPicks' },
      { type: 'nextRound' },
    );
    expect(Object.hasOwn(r.state.players, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(r.state.players)).toBe(Object.prototype);
    expect(r.state.lastRanking?.totals[0]).toMatchObject({ pid: '__proto__', total: 950 });
    const lobby = run(r.state, { type: 'backToLobby' }).state;
    expect(Object.getPrototypeOf(lobby.players)).toBe(Object.prototype);
    expect(Object.keys(lobby.players)).toEqual(['__proto__', 'b']);
  });

  it('shutter の無い submit は無視', () => {
    const r = run(inPlayerTurn(), {
      type: 'submit',
      round: 1,
      pid: 'a',
      key: keyOf('a'),
      at: START + 1000,
    });
    expect(r.state.submissions.a).toBeUndefined();
    expect(r.emit).toEqual([]);
  });

  it('shutter から 30001 ms 後の submit は無視、30000 ms は受け付ける', () => {
    const r = run(
      inPlayerTurn(['a', 'b', 'c']),
      { type: 'shutter', round: 1, pid: 'a', hash: 'x', at: START + 1000 },
      { type: 'shutter', round: 1, pid: 'b', hash: 'y', at: START + 1000 },
      { type: 'submit', round: 1, pid: 'a', key: keyOf('a'), at: START + 31001 },
      { type: 'submit', round: 1, pid: 'b', key: keyOf('b'), at: START + 31000 },
    );
    expect(r.state.submissions.a).toBeUndefined();
    expect(r.state.submissions.b).toEqual({ key: keyOf('b'), at: START + 31000 });
    expect(r.emit).toEqual([{ type: 'submitted', pids: ['b'] }]);
  });

  it('全員が submit したら T を待たずに picking へ', () => {
    let r = run(inPlayerTurn(), ...shutterAndSubmit('a', 6000));
    expect(r.state.phase).toBe('playerTurn');
    r = run(r.state, ...shutterAndSubmit('b', 8000));
    expect(r.state.phase).toBe('picking');
    expect(r.emit).toEqual([
      { type: 'submitted', pids: ['a', 'b'] },
      { type: 'picking', round: 1 },
    ]);
  });

  it('T を過ぎた tick で picking へ', () => {
    let s = run(inPlayerTurn(), ...shutterAndSubmit('a', 6000)).state;
    s = run(s, { type: 'tick', now: START + T }).state;
    expect(s.phase).toBe('playerTurn');
    const r = run(s, { type: 'tick', now: START + T + 1 });
    expect(r.state.phase).toBe('picking');
    expect(r.emit).toContainEqual({ type: 'picking', round: 1 });
  });

  it('T を過ぎても shutter から 30 秒以内の提出待ちがあれば待つ', () => {
    let s = run(inPlayerTurn(), {
      type: 'shutter',
      round: 1,
      pid: 'a',
      hash: 'x',
      at: START + 55000,
    }).state;
    s = run(s, { type: 'tick', now: START + T + 1 }).state;
    expect(s.phase).toBe('playerTurn');
    s = run(s, { type: 'submit', round: 1, pid: 'a', key: keyOf('a'), at: START + 70000 }).state;
    expect(s.submissions.a).toBeDefined();
    s = run(s, { type: 'tick', now: START + 70001 }).state;
    expect(s.phase).toBe('picking');
  });

  it('提出待ちが 30 秒を過ぎたら picking へ', () => {
    let s = run(inPlayerTurn(), {
      type: 'shutter',
      round: 1,
      pid: 'a',
      hash: 'x',
      at: START + 55000,
    }).state;
    s = run(s, { type: 'tick', now: START + 85000 }).state;
    expect(s.phase).toBe('playerTurn');
    s = run(s, { type: 'tick', now: START + 85001 }).state;
    expect(s.phase).toBe('picking');
  });
});

describe('途中参加と名前', () => {
  it('playerTurn 中に入った人はそのラウンドに提出できず、全員提出の判定にも入らない', () => {
    let r = run(inPlayerTurn(['a']), join('late', 'late'));
    expect(r.state.players.late).toBeDefined();
    r = run(r.state, { type: 'shutter', round: 1, pid: 'late', hash: 'x', at: START + 1000 });
    expect(r.state.shutters.late).toBeUndefined();
    r = run(r.state, ...shutterAndSubmit('a', 2000));
    expect(r.state.phase).toBe('picking');

    r = run(r.state, { type: 'togglePick', pid: 'a' }, { type: 'confirmPicks' });
    expect(r.state.lastRanking?.scores.map((x) => x.pid)).toEqual(['a']);
    expect(r.state.lastRanking?.totals.map((x) => x.pid)).toContain('late');

    r = run(
      r.state,
      { type: 'nextRound' },
      { type: 'gmPhotoUploaded', key: 'k' },
      { type: 'hintsReady', hints: HINTS, at: START },
      ...shutterAndSubmit('late', 3000, 2),
    );
    expect(r.state.submissions.late).toBeDefined();
    expect(r.state.phase).toBe('playerTurn'); // a はまだ出していない
  });

  it('gmTurn 中に入った人はそのラウンドから提出できる', () => {
    const s = run(
      init(),
      join('a'),
      { type: 'start', gameId: 'game1' },
      join('b'),
      { type: 'gmPhotoUploaded', key: 'k' },
      { type: 'hintsReady', hints: HINTS, at: START },
      { type: 'shutter', round: 1, pid: 'b', hash: 'x', at: START + 1000 },
    ).state;
    expect(s.shutters.b).toBeDefined();
  });

  it('同じ名前の 2 人目は「はるか (2)」', () => {
    const s = run(init(), join('p1', 'はるか'), join('p2', 'はるか'), join('p3', 'はるか')).state;
    expect(s.players.p1?.label).toBe('はるか');
    expect(s.players.p2?.label).toBe('はるか (2)');
    expect(s.players.p3?.label).toBe('はるか (3)');
  });

  it('ロビーでの参加は lobby を emit し、GM 自身と既存の pid は無視する', () => {
    const r = run(init(), join('a', 'あ'));
    expect(r.emit).toEqual([
      {
        type: 'lobby',
        players: [{ pid: 'a', name: 'あ', label: 'あ' }],
        gmPid: 'gm',
        locale: 'ja',
        rounds: 3,
        limitSec: 60,
      },
    ]);
    const r2 = run(r.state, join('gm'), join('a', '別名'));
    expect(r2.emit).toEqual([]);
    expect(Object.keys(r2.state.players)).toEqual(['a']);
    expect(r2.state.players.a?.name).toBe('あ');
  });
});

describe('選択と得点', () => {
  it('photoChecked { valid: false } の人は togglePick できない', () => {
    const s = run(
      inPicking(),
      { type: 'photoChecked', pid: 'a', valid: false },
      { type: 'togglePick', pid: 'a' },
    ).state;
    expect(s.picks).toEqual([]);
  });

  it('選んだ後に無効と分かった人は選択から外れる', () => {
    const s = run(
      inPicking(),
      { type: 'togglePick', pid: 'a' },
      { type: 'photoChecked', pid: 'a', valid: false },
    ).state;
    expect(s.picks).toEqual([]);
  });

  it('togglePick は 3 人まで、もう一度押すと外れる、提出の無い人は選べない', () => {
    let s = run(inPlayerTurn(['a', 'b', 'c', 'd', 'e'])).state;
    s = run(s, ...['a', 'b', 'c', 'd'].flatMap((p, i) => shutterAndSubmit(p, 1000 * (i + 1))), {
      type: 'tick',
      now: START + T + 1,
    }).state;
    expect(s.phase).toBe('picking');
    s = run(
      s,
      ...['a', 'b', 'c', 'd', 'e'].map((pid) => ({ type: 'togglePick', pid }) as GmAction),
    ).state;
    expect(s.picks).toEqual(['a', 'b', 'c']);
    s = run(s, { type: 'togglePick', pid: 'b' }).state;
    expect(s.picks).toEqual(['a', 'c']);
    s = run(s, { type: 'togglePick', pid: 'd' }).state;
    expect(s.picks).toEqual(['a', 'c', 'd']);
  });

  it('resultsReady で results を emit し、valid は photoChecked から埋める', () => {
    const r = run(
      inPicking(),
      { type: 'photoChecked', pid: 'b', valid: false },
      {
        type: 'resultsReady',
        gmPhotoUrl: 'https://r2/gm',
        photos: [
          { pid: 'a', url: 'https://r2/a' },
          { pid: 'b', url: 'https://r2/b' },
          { pid: 'c', url: 'https://r2/c' },
        ],
      },
    );
    expect(r.emit).toEqual([
      {
        type: 'results',
        round: 1,
        gmPhotoUrl: 'https://r2/gm',
        photos: [
          { pid: 'a', url: 'https://r2/a', valid: true },
          { pid: 'b', url: 'https://r2/b', valid: false },
          { pid: 'c', url: 'https://r2/c', valid: true },
        ],
      },
    ]);
  });

  it('resultsReady の後の photoChecked は valid を更新した results を再 emit する', () => {
    const photos = [
      { pid: 'a', url: 'https://r2/a' },
      { pid: 'b', url: 'https://r2/b' },
    ];
    let r = run(inPicking(), { type: 'photoChecked', pid: 'c', valid: true });
    expect(r.emit).toEqual([]);
    r = run(
      r.state,
      { type: 'resultsReady', gmPhotoUrl: 'g', photos },
      { type: 'photoChecked', pid: 'a', valid: false },
    );
    expect(r.emit.at(-1)).toEqual({
      type: 'results',
      round: 1,
      gmPhotoUrl: 'g',
      photos: [
        { pid: 'a', url: 'https://r2/a', valid: false },
        { pid: 'b', url: 'https://r2/b', valid: true },
      ],
    });
    expect(r.state.results?.photos[0]?.valid).toBe(false);
  });

  it('confirmPicks で scoreRound の結果が ranking に入り、total と streak が更新される', () => {
    const r = run(
      inPicking(),
      { type: 'togglePick', pid: 'b' },
      { type: 'togglePick', pid: 'a' },
      { type: 'confirmPicks' },
    );
    expect(r.state.phase).toBe('reveal');
    const ranking = r.emit.find((e) => e.type === 'ranking');
    expect(ranking).toEqual({
      type: 'ranking',
      round: 1,
      scores: [
        { pid: 'a', rank: 2, tMs: 6000, multiplier: 0.95, points: 665, bonus: 0, streak: 1 },
        { pid: 'b', rank: 1, tMs: 12000, multiplier: 0.9, points: 900, bonus: 0, streak: 1 },
        { pid: 'c', rank: null, tMs: 30000, multiplier: null, points: 0, bonus: 0, streak: 0 },
      ],
      totals: [
        { pid: 'b', total: 900, rank: 1, delta: 0 },
        { pid: 'a', total: 665, rank: 2, delta: 0 },
        { pid: 'c', total: 0, rank: 3, delta: 0 },
      ],
    });
    expect(r.state.players.a).toMatchObject({ total: 665, streak: 1 });
    expect(r.state.players.b).toMatchObject({ total: 900, streak: 1 });
    expect(r.state.players.c).toMatchObject({ total: 0, streak: 0 });
  });

  it('2 ラウンド目の ranking は順位の変動を delta に、同点は同じ順位にする', () => {
    let s = run(inPicking(), { type: 'togglePick', pid: 'b' }, { type: 'confirmPicks' }).state;
    // 1 ラウンド目：b 900、a 0、c 0（a と c は同点 2 位）
    expect(s.lastRanking?.totals).toEqual([
      { pid: 'b', total: 900, rank: 1, delta: 0 },
      { pid: 'a', total: 0, rank: 2, delta: 0 },
      { pid: 'c', total: 0, rank: 2, delta: 0 },
    ]);
    const r = run(
      s,
      { type: 'nextRound' },
      { type: 'gmPhotoUploaded', key: 'k' },
      { type: 'hintsReady', hints: HINTS, at: START },
      ...shutterAndSubmit('a', 0, 2),
      ...shutterAndSubmit('b', 60000, 2),
      ...shutterAndSubmit('c', 60000, 2),
      { type: 'togglePick', pid: 'a' },
      { type: 'togglePick', pid: 'b' },
      { type: 'confirmPicks' },
    );
    s = r.state;
    // a 1000、b 900 + 350 + 100（ストリーク 2）= 1350、c 0
    expect(s.lastRanking?.totals).toEqual([
      { pid: 'b', total: 1350, rank: 1, delta: 0 },
      { pid: 'a', total: 1000, rank: 2, delta: 0 },
      { pid: 'c', total: 0, rank: 3, delta: -1 },
    ]);
    expect(s.players.b?.streak).toBe(2);
  });

  it('最終ラウンドの nextRound で final、backToLobby で lobby に戻り total と streak が 0', () => {
    let r = run(
      inPicking(),
      { type: 'togglePick', pid: 'a' },
      { type: 'confirmPicks' },
      { type: 'nextRound' },
    );
    expect(r.state.phase).toBe('gmTurn');
    expect(r.state.round).toBe(2);
    expect(r.emit.at(-1)).toEqual({ type: 'gm_turn', round: 2, gameId: r.state.gameId });

    const finishRound = (s: GmState) =>
      run(
        s,
        { type: 'gmPhotoUploaded', key: 'k' },
        { type: 'hintsReady', hints: HINTS, at: START },
        { type: 'tick', now: START + T + 1 },
        { type: 'confirmPicks' },
        { type: 'nextRound' },
      );
    r = finishRound(r.state);
    expect(r.state.round).toBe(3);
    r = finishRound(r.state);
    expect(r.state.phase).toBe('final');
    expect(r.emit.at(-1)).toEqual({ type: 'final', totals: r.state.lastRanking?.totals });

    r = run(r.state, { type: 'backToLobby' });
    expect(r.state.phase).toBe('lobby');
    expect(r.state.round).toBe(0);
    for (const p of Object.values(r.state.players)) {
      expect(p.total).toBe(0);
      expect(p.streak).toBe(0);
    }
    expect(r.emit[0]?.type).toBe('lobby');
  });

  it('transferred で transfer を emit する', () => {
    const transfer = { body: { room: '123456', from: 'gm', to: 'a', iat: 0, exp: 1 }, sig: 's' };
    const r = run(init(), join('a'), { type: 'transferred', transfer });
    expect(r.emit.at(-1)).toEqual({ type: 'transfer', transfer });
  });

  it('start で渡した gameId を使う', () => {
    const r = run(init(), join('a'), { type: 'start', gameId: 'abc_123' });
    expect(r.state.gameId).toBe('abc_123');
    expect(r.emit).toContainEqual({ type: 'gm_turn', round: 1, gameId: 'abc_123' });
  });

  it('dissolve はどのフェーズからでも dissolved を emit し、以後のアクションを無視する', () => {
    const r = run(inPlayerTurn(), { type: 'dissolve' });
    expect(r.emit).toEqual([{ type: 'dissolved' }]);
    expect(r.state.dissolved).toBe(true);
    for (const a of [
      { type: 'tick', now: START + 20000 },
      { type: 'shutter', round: 1, pid: 'a', hash: 'x', at: START + 1000 },
      { type: 'backToLobby' },
      { type: 'dissolve' },
    ] as GmAction[]) {
      const r2 = gmReduce(r.state, a);
      expect(r2.state).toBe(r.state);
      expect(r2.emit).toEqual([]);
    }
    expect(run(init(), { type: 'dissolve' }).emit).toEqual([{ type: 'dissolved' }]);
  });

  it('フェーズに合わないアクションは何もしない', () => {
    const s = init();
    for (const a of [
      { type: 'gmPhotoUploaded', key: 'k' },
      { type: 'confirmPicks' },
      { type: 'nextRound' },
      { type: 'tick', now: 1 },
    ] as GmAction[]) {
      const r = gmReduce(s, a);
      expect(r.state).toBe(s);
      expect(r.emit).toEqual([]);
    }
  });
});

describe('snapshotOf とスキーマ', () => {
  it('playerTurn のスナップショットは出したヒントと経過時間を持つ', () => {
    const s = run(inPlayerTurn(), { type: 'tick', now: START + 12000 }).state;
    const snap = snapshotOf(s, START + 15000);
    expect(snap).toMatchObject({
      type: 'snapshot',
      phase: 'playerTurn',
      round: 1,
      rounds: 3,
      limitSec: 60,
      locale: 'ja',
      gmPid: 'gm',
      hints: ['h0', 'h1'],
      turnElapsedMs: 15000,
      gameId: 'game1',
      submitted: [],
      results: null,
      ranking: null,
      final: null,
    });
    expect(v.is(GmSnapshotSchema, { ...snap, pid: 'gm', seq: 3, epoch: 1, lastEventSeq: 7 })).toBe(
      true,
    );
    expect(v.is(GmSnapshotSchema, { ...snap, pid: 'gm', seq: 3, epoch: 1 })).toBe(false); // lastEventSeq が無い
  });

  it('reveal のスナップショットの ranking はラウンド番号を持つ', () => {
    const s = run(inPicking(), { type: 'togglePick', pid: 'a' }, { type: 'confirmPicks' }).state;
    const snap = snapshotOf(s, START);
    expect(snap.ranking?.round).toBe(1);
    expect(snap.ranking?.scores.find((x) => x.pid === 'a')?.rank).toBe(1);
    expect(v.is(GmSnapshotSchema, { ...snap, pid: 'gm', seq: 9, epoch: 1, lastEventSeq: 12 })).toBe(
      true,
    );
  });

  it('emit はすべて GmEventSchema を満たす', () => {
    const r = run(
      inPicking(),
      { type: 'resultsReady', gmPhotoUrl: 'g', photos: [{ pid: 'a', url: 'u' }] },
      { type: 'togglePick', pid: 'a' },
      { type: 'confirmPicks' },
      { type: 'nextRound' },
    );
    for (const e of r.emit)
      expect(v.is(GmEventSchema, { ...e, pid: 'gm', seq: 1, epoch: 1 })).toBe(true);
    expect(
      v.is(GmEventSchema, {
        type: 'hint',
        pid: 'gm',
        seq: 1,
        epoch: 1,
        round: 1,
        index: 5,
        text: 'x',
      }),
    ).toBe(false);
  });

  it('PlayerEventSchema', () => {
    expect(v.is(PlayerEventSchema, { pid: 'a', seq: 0, type: 'join', name: 'あ' })).toBe(true);
    expect(
      v.is(PlayerEventSchema, { pid: 'a', seq: 0, type: 'shutter', round: 1, hash: 'h' }),
    ).toBe(true);
    expect(v.is(PlayerEventSchema, { pid: 'a', seq: 0, type: 'submit', round: 1, key: 'k' })).toBe(
      true,
    );
    expect(v.is(PlayerEventSchema, { pid: 'a', seq: 0, type: 'resync' })).toBe(true);
    expect(v.is(PlayerEventSchema, { pid: 'a', seq: 0, type: 'shutter', round: 1 })).toBe(false);
    expect(v.is(PlayerEventSchema, { pid: 'a', type: 'resync' })).toBe(false); // seq が無い
  });
});

describe('gmPersist', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('saveGm → loadGm が往復する', () => {
    const s = inPicking();
    saveGm('123456', s);
    expect(store.has('sh:gm:123456')).toBe(true);
    expect(loadGm('123456')).toEqual(s);
  });

  it('localStorage が例外を投げても saveGm は投げない', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    });
    expect(() => saveGm('123456', init())).not.toThrow();
  });

  it('無い部屋と壊れた JSON は null', () => {
    expect(loadGm('999999')).toBeNull();
    store.set('sh:gm:123456', '{broken');
    expect(loadGm('123456')).toBeNull();
    store.set('sh:gm:123456', '42');
    expect(loadGm('123456')).toBeNull();
  });
});

describe('部屋を出た人と、通信が切れた人', () => {
  const away = (pid: string): GmAction => ({ type: 'presence', pid, active: false });
  const back = (pid: string): GmAction => ({ type: 'presence', pid, active: true });

  it('ロビーで出た人は一覧から消え、lobby を emit する。同じ pid の join はもう受け付けない', () => {
    let r = run(init(), join('a'), join('b'), { type: 'playerLeft', pid: 'b' });
    expect(Object.keys(r.state.players)).toEqual(['a']);
    expect(r.state.left).toEqual(['b']);
    expect(r.emit.at(-1)).toMatchObject({ type: 'lobby', players: [{ pid: 'a' }] });
    r = run(r.state, join('b'), { type: 'presence', pid: 'b', active: true });
    expect(Object.keys(r.state.players)).toEqual(['a']);
    expect(r.emit).toEqual([]);
    // 入り直すと新しい pid なので、普通に加わる（人数は重ならない）
    r = run(r.state, join('b2', 'b'));
    expect(Object.keys(r.state.players)).toEqual(['a', 'b2']);
    expect(r.state.players.b2.label).toBe('b');
  });

  it('知らない pid の playerLeft と presence は何もしない', () => {
    const s = run(init(), join('a')).state;
    expect(gmReduce(s, { type: 'playerLeft', pid: 'zz' }).state).toBe(s);
    expect(gmReduce(s, { type: 'presence', pid: '__proto__', active: false }).state).toBe(s);
    expect(gmReduce(s, back('a')).state).toBe(s); // away でない人を戻しても変わらない
  });

  it('ターン中に出た人を待たず、残りの全員が出していれば picking へ', () => {
    let r = run(inPlayerTurn(['a', 'b', 'c']), ...shutterAndSubmit('a', 6000));
    r = run(r.state, ...shutterAndSubmit('b', 7000));
    expect(r.state.phase).toBe('playerTurn');
    r = run(r.state, { type: 'playerLeft', pid: 'c' });
    expect(r.state.phase).toBe('picking');
    expect(r.emit).toEqual([{ type: 'picking', round: 1 }]);
  });

  it('出た人が先に出すと、残りの全員が出した時点で picking へ（出た人の提出は消える）', () => {
    let r = run(inPlayerTurn(['a', 'b', 'c']), ...shutterAndSubmit('c', 5000), {
      type: 'playerLeft',
      pid: 'c',
    });
    expect(r.state.submissions.c).toBeUndefined();
    expect(r.state.phase).toBe('playerTurn');
    r = run(r.state, ...shutterAndSubmit('a', 6000), ...shutterAndSubmit('b', 7000));
    expect(r.state.phase).toBe('picking');
    // 出た人は一覧に left: true で残る（それまでの得点で順位に残すため）
    expect(snapshotOf(r.state, START).players.map((p) => [p.pid, p.left ?? false])).toEqual([
      ['a', false],
      ['b', false],
      ['c', true],
    ]);
  });

  it('away の人は全員提出の判定から外れ、戻ると判定に入る', () => {
    let r = run(inPlayerTurn(['a', 'b', 'c']), away('c'), ...shutterAndSubmit('a', 6000));
    expect(r.state.phase).toBe('playerTurn');
    r = run(r.state, back('c'), ...shutterAndSubmit('b', 7000));
    expect(r.state.phase).toBe('playerTurn'); // c が戻ったので待つ
    r = run(r.state, away('c'));
    expect(r.state.phase).toBe('picking'); // c が切れたら待たない
    expect(r.emit).toEqual([{ type: 'picking', round: 1 }]);
  });

  it('全員が away になっても、誰も出していなければターンは時間まで続く', () => {
    const r = run(inPlayerTurn(['a', 'b']), away('a'), away('b'));
    expect(r.state.phase).toBe('playerTurn');
  });

  it('away の人はスナップショットとロビーに away: true で載る', () => {
    const r = run(init(), join('a'), join('b'), away('b'));
    expect(r.emit.at(-1)).toMatchObject({
      type: 'lobby',
      players: [{ pid: 'a' }, { pid: 'b', away: true }],
    });
    expect(r.emit.at(-1)).not.toHaveProperty('players.0.away');
    const snap = snapshotOf(r.state, 0);
    expect(snap.players).toEqual([
      { pid: 'a', name: 'a', label: 'a' },
      { pid: 'b', name: 'b', label: 'b', away: true },
    ]);
    expect(
      v.safeParse(GmSnapshotSchema, { ...snap, pid: 'gm', seq: 0, epoch: 1, lastEventSeq: -1 })
        .success,
    ).toBe(true);
  });

  it('away の人の得点は残り、最終結果にも載る', () => {
    let s = run(
      inPlayerTurn(['a', 'b']),
      ...shutterAndSubmit('a', 6000),
      ...shutterAndSubmit('b', 7000),
      { type: 'togglePick', pid: 'b' },
      { type: 'confirmPicks' },
    ).state;
    const before = s.players.b.total;
    expect(before).toBeGreaterThan(0);
    s = run(s, away('b'), { type: 'nextRound' }).state;
    expect(s.players.b.total).toBe(before);
    expect(s.players.b.away).toBe(true);
    s = run(
      s,
      { type: 'gmPhotoUploaded', key: 'gm.jpg' },
      { type: 'hintsReady', hints: HINTS, at: START },
      ...shutterAndSubmit('a', 6000, 2),
    ).state;
    expect(s.phase).toBe('picking'); // b は away なので待たない
    s = run(s, { type: 'confirmPicks' }).state;
    expect(s.lastRanking?.totals.find((t) => t.pid === 'b')?.total).toBe(before);
  });

  it('picking で出た人の写真は取り下げ、results を送り直す。得点は 0 のまま順位に残る', () => {
    let s = run(inPicking(), {
      type: 'resultsReady',
      gmPhotoUrl: 'g',
      photos: ['a', 'b', 'c'].map((pid) => ({ pid, url: pid })),
    }).state;
    s = run(s, { type: 'togglePick', pid: 'c' }).state;
    const r = run(s, { type: 'playerLeft', pid: 'c' });
    expect(r.state.phase).toBe('picking');
    expect(r.state.picks).toEqual([]);
    expect(r.emit).toEqual([
      {
        type: 'results',
        round: 1,
        gmPhotoUrl: 'g',
        photos: [
          { pid: 'a', url: 'a', valid: true },
          { pid: 'b', url: 'b', valid: true },
        ],
      },
    ]);
    s = run(r.state, { type: 'togglePick', pid: 'a' }, { type: 'confirmPicks' }).state;
    expect(s.lastRanking?.totals.map((t) => t.pid).sort()).toEqual(['a', 'b', 'c']);
    expect(s.lastRanking?.totals.find((t) => t.pid === 'c')?.total).toBe(0);
  });

  /** a, b, c が 1 ラウンド目で a > b > c の順に得点した reveal の状態。 */
  const inReveal = (rounds = 3) =>
    run(
      run(
        init(rounds),
        ...['a', 'b', 'c'].map((p) => join(p)),
        { type: 'start', gameId: 'game1' },
        { type: 'gmPhotoUploaded', key: 'gm.jpg' },
        { type: 'hintsReady', hints: HINTS, at: START },
      ).state,
      ...shutterAndSubmit('a', 6000),
      ...shutterAndSubmit('b', 12000),
      ...shutterAndSubmit('c', 30000),
      { type: 'togglePick', pid: 'a' },
      { type: 'togglePick', pid: 'b' },
      { type: 'togglePick', pid: 'c' },
      { type: 'confirmPicks' },
    ).state;

  it('reveal で出ても、何も emit せず、画面も順位も変えない', () => {
    const s = inReveal();
    expect(s.phase).toBe('reveal');
    const r = run(s, { type: 'playerLeft', pid: 'a' });
    expect(r.emit).toEqual([]);
    expect(r.state.phase).toBe('reveal');
    expect(r.state.lastRanking).toEqual(s.lastRanking);
    expect(r.state.results).toEqual(s.results);
    expect(snapshotOf(r.state, 0).ranking).toEqual(snapshotOf(s, 0).ranking);
  });

  it('final で 1 位の人が出ても、表彰台は変わらない', () => {
    const s = run(inReveal(1), { type: 'nextRound' }).state;
    expect(s.phase).toBe('final');
    const winner = s.lastRanking!.totals[0];
    expect(winner).toMatchObject({ pid: 'a', rank: 1 });
    const r = run(s, { type: 'playerLeft', pid: 'a' });
    expect(r.emit).toEqual([]);
    expect(r.state.phase).toBe('final');
    expect(snapshotOf(r.state, 0).final).toEqual(snapshotOf(s, 0).final);
    expect(snapshotOf(r.state, 0).players.find((p) => p.pid === 'a')).toMatchObject({ left: true });
  });

  it('途中で出た人は得点がそのまま残り、以後は得点せず、全員提出の判定も待たない', () => {
    let s = inReveal();
    const before = s.players.a.total;
    expect(before).toBeGreaterThan(0);
    s = run(
      s,
      { type: 'playerLeft', pid: 'a' },
      { type: 'nextRound' },
      { type: 'gmPhotoUploaded', key: 'gm.jpg' },
      { type: 'hintsReady', hints: HINTS, at: START },
    ).state;
    // 出た人の shutter は受け付けない
    s = run(s, { type: 'shutter', round: 2, pid: 'a', hash: 'x', at: START + 1000 }).state;
    expect(s.shutters.a).toBeUndefined();
    s = run(s, ...shutterAndSubmit('b', 6000, 2), ...shutterAndSubmit('c', 7000, 2)).state;
    expect(s.phase).toBe('picking'); // a を待たない
    s = run(s, { type: 'togglePick', pid: 'c' }, { type: 'confirmPicks' }).state;
    expect(s.players.a.total).toBe(before);
    expect(s.lastRanking?.totals.find((t) => t.pid === 'a')?.total).toBe(before);
  });

  it('ロビーに戻すと、出た人と通信が切れている人は一覧から外れる', () => {
    const s = run(
      inReveal(1),
      { type: 'playerLeft', pid: 'a' },
      away('b'),
      { type: 'nextRound' },
      { type: 'backToLobby' },
    );
    expect(Object.keys(s.state.players)).toEqual(['c']);
    expect(s.emit.at(-1)).toMatchObject({ type: 'lobby', players: [{ pid: 'c' }] });
    // 出た人はもう戻れない。通信が切れていた人は join し直せば戻る
    const r = run(s.state, join('a'), join('b'));
    expect(Object.keys(r.state.players)).toEqual(['c', 'b']);
  });

  it('出た人の presence は無視する', () => {
    const s = run(inReveal(), { type: 'playerLeft', pid: 'a' }).state;
    expect(gmReduce(s, { type: 'presence', pid: 'a', active: false }).state).toBe(s);
  });

  it('leave / ping / away はプレイヤーのメッセージとして形が通る', () => {
    for (const type of ['leave', 'ping', 'away'])
      expect(v.safeParse(PlayerEventSchema, { pid: 'a', seq: 3, type }).success).toBe(true);
  });
});

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

const join = (pid: string, name = pid, at = 0): GmAction => ({ type: 'playerJoined', pid, name, at });

/** a, b が参加済みで、ラウンド 1 のプレイヤーのターンが START に始まった状態。 */
const inPlayerTurn = (pids = ['a', 'b']) =>
  run(
    init(),
    ...pids.map((p) => join(p)),
    { type: 'start' },
    { type: 'gmPhotoUploaded', key: 'gm.jpg' },
    { type: 'hintsReady', hints: HINTS, at: START },
  ).state;

const shutterAndSubmit = (pid: string, dt: number): GmAction[] => [
  { type: 'shutter', pid, hash: `hash-${pid}`, at: START + dt },
  { type: 'submit', pid, key: `${pid}.jpg`, at: START + dt + 1000 },
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
    let r = run(init(), join('a'), { type: 'start' });
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
    let r = run(init(), join('a'), { type: 'start' }, { type: 'gmPhotoUploaded', key: 'k' });
    r = run(r.state, { type: 'hintsFailed' });
    expect(r.state.phase).toBe('hintError');
    expect(r.emit).toEqual([{ type: 'hint_error' }]);
    r = run(r.state, { type: 'retryHints' });
    expect(r.state.phase).toBe('hinting');
    expect(r.emit).toEqual([{ type: 'hinting' }]);
  });

  it('ヒントが 5 つでない hintsReady は無視する', () => {
    const r = run(init(), join('a'), { type: 'start' }, { type: 'gmPhotoUploaded', key: 'k' });
    const r2 = gmReduce(r.state, { type: 'hintsReady', hints: ['x'], at: START });
    expect(r2.state.phase).toBe('hinting');
    expect(r2.emit).toEqual([]);
  });
});

describe('shutter と submit', () => {
  it('turnStartedAt + 6000 の shutter は t = 6000、同じ pid の 2 回目は無視', () => {
    let s = run(inPlayerTurn(), { type: 'shutter', pid: 'a', hash: 'x', at: START + 6000 }).state;
    expect(s.shutters.a).toEqual({ at: START + 6000, hash: 'x' });
    s = run(s, { type: 'shutter', pid: 'a', hash: 'y', at: START + 7000 }).state;
    expect(s.shutters.a).toEqual({ at: START + 6000, hash: 'x' });
  });

  it('turnStartedAt + 60001 の shutter は無視、+60000 は受け付ける', () => {
    const s = run(
      inPlayerTurn(),
      { type: 'shutter', pid: 'a', hash: 'x', at: START + 60001 },
      { type: 'shutter', pid: 'b', hash: 'y', at: START + 60000 },
    ).state;
    expect(s.shutters.a).toBeUndefined();
    expect(s.shutters.b).toBeDefined();
  });

  it('shutter の無い submit は無視', () => {
    const r = run(inPlayerTurn(), { type: 'submit', pid: 'a', key: 'a.jpg', at: START + 1000 });
    expect(r.state.submissions.a).toBeUndefined();
    expect(r.emit).toEqual([]);
  });

  it('shutter から 30001 ms 後の submit は無視、30000 ms は受け付ける', () => {
    const r = run(
      inPlayerTurn(['a', 'b', 'c']),
      { type: 'shutter', pid: 'a', hash: 'x', at: START + 1000 },
      { type: 'shutter', pid: 'b', hash: 'y', at: START + 1000 },
      { type: 'submit', pid: 'a', key: 'a.jpg', at: START + 31001 },
      { type: 'submit', pid: 'b', key: 'b.jpg', at: START + 31000 },
    );
    expect(r.state.submissions.a).toBeUndefined();
    expect(r.state.submissions.b).toEqual({ key: 'b.jpg', at: START + 31000 });
    expect(r.emit).toEqual([{ type: 'submitted', pids: ['b'] }]);
  });

  it('全員が submit したら T を待たずに picking へ', () => {
    let r = run(inPlayerTurn(), ...shutterAndSubmit('a', 6000));
    expect(r.state.phase).toBe('playerTurn');
    r = run(r.state, ...shutterAndSubmit('b', 8000));
    expect(r.state.phase).toBe('picking');
    expect(r.emit).toEqual([{ type: 'submitted', pids: ['a', 'b'] }]);
  });

  it('T を過ぎた tick で picking へ', () => {
    let s = run(inPlayerTurn(), ...shutterAndSubmit('a', 6000)).state;
    s = run(s, { type: 'tick', now: START + T }).state;
    expect(s.phase).toBe('playerTurn');
    s = run(s, { type: 'tick', now: START + T + 1 }).state;
    expect(s.phase).toBe('picking');
  });

  it('T を過ぎても shutter から 30 秒以内の提出待ちがあれば待つ', () => {
    let s = run(inPlayerTurn(), { type: 'shutter', pid: 'a', hash: 'x', at: START + 55000 }).state;
    s = run(s, { type: 'tick', now: START + T + 1 }).state;
    expect(s.phase).toBe('playerTurn');
    s = run(s, { type: 'submit', pid: 'a', key: 'a.jpg', at: START + 70000 }).state;
    expect(s.submissions.a).toBeDefined();
    s = run(s, { type: 'tick', now: START + 70001 }).state;
    expect(s.phase).toBe('picking');
  });

  it('提出待ちが 30 秒を過ぎたら picking へ', () => {
    let s = run(inPlayerTurn(), { type: 'shutter', pid: 'a', hash: 'x', at: START + 55000 }).state;
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
    r = run(r.state, { type: 'shutter', pid: 'late', hash: 'x', at: START + 1000 });
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
      ...shutterAndSubmit('late', 3000),
    );
    expect(r.state.submissions.late).toBeDefined();
    expect(r.state.phase).toBe('playerTurn'); // a はまだ出していない
  });

  it('gmTurn 中に入った人はそのラウンドから提出できる', () => {
    const s = run(
      init(),
      join('a'),
      { type: 'start' },
      join('b'),
      { type: 'gmPhotoUploaded', key: 'k' },
      { type: 'hintsReady', hints: HINTS, at: START },
      { type: 'shutter', pid: 'b', hash: 'x', at: START + 1000 },
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
    const s = run(inPicking(), { type: 'photoChecked', pid: 'a', valid: false }, { type: 'togglePick', pid: 'a' })
      .state;
    expect(s.picks).toEqual([]);
  });

  it('選んだ後に無効と分かった人は選択から外れる', () => {
    const s = run(inPicking(), { type: 'togglePick', pid: 'a' }, { type: 'photoChecked', pid: 'a', valid: false })
      .state;
    expect(s.picks).toEqual([]);
  });

  it('togglePick は 3 人まで、もう一度押すと外れる、提出の無い人は選べない', () => {
    let s = run(inPlayerTurn(['a', 'b', 'c', 'd', 'e'])).state;
    s = run(s, ...['a', 'b', 'c', 'd'].flatMap((p, i) => shutterAndSubmit(p, 1000 * (i + 1))), {
      type: 'tick',
      now: START + T + 1,
    }).state;
    expect(s.phase).toBe('picking');
    s = run(s, ...['a', 'b', 'c', 'd', 'e'].map((pid) => ({ type: 'togglePick', pid }) as GmAction)).state;
    expect(s.picks).toEqual(['a', 'b', 'c']);
    s = run(s, { type: 'togglePick', pid: 'b' }).state;
    expect(s.picks).toEqual(['a', 'c']);
    s = run(s, { type: 'togglePick', pid: 'd' }).state;
    expect(s.picks).toEqual(['a', 'c', 'd']);
  });

  it('resultsReady で results を emit し、valid は photoChecked から埋める', () => {
    const r = run(inPicking(), { type: 'photoChecked', pid: 'b', valid: false }, {
      type: 'resultsReady',
      gmPhotoUrl: 'https://r2/gm',
      photos: [
        { pid: 'a', url: 'https://r2/a' },
        { pid: 'b', url: 'https://r2/b' },
        { pid: 'c', url: 'https://r2/c' },
      ],
    });
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
      ...shutterAndSubmit('a', 0),
      ...shutterAndSubmit('b', 60000),
      ...shutterAndSubmit('c', 60000),
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
      submitted: [],
      results: null,
      ranking: null,
      final: null,
    });
    expect(v.is(GmSnapshotSchema, { ...snap, pid: 'gm', seq: 3 })).toBe(true);
  });

  it('emit はすべて GmEventSchema を満たす', () => {
    const r = run(
      inPicking(),
      { type: 'resultsReady', gmPhotoUrl: 'g', photos: [{ pid: 'a', url: 'u' }] },
      { type: 'togglePick', pid: 'a' },
      { type: 'confirmPicks' },
      { type: 'nextRound' },
    );
    for (const e of r.emit) expect(v.is(GmEventSchema, { ...e, pid: 'gm', seq: 1 })).toBe(true);
    expect(v.is(GmEventSchema, { type: 'hint', pid: 'gm', seq: 1, round: 1, index: 5, text: 'x' })).toBe(false);
  });

  it('PlayerEventSchema', () => {
    expect(v.is(PlayerEventSchema, { pid: 'a', type: 'join', name: 'あ' })).toBe(true);
    expect(v.is(PlayerEventSchema, { pid: 'a', type: 'shutter', round: 1, hash: 'h' })).toBe(true);
    expect(v.is(PlayerEventSchema, { pid: 'a', type: 'submit', round: 1, key: 'k' })).toBe(true);
    expect(v.is(PlayerEventSchema, { pid: 'a', type: 'resync' })).toBe(true);
    expect(v.is(PlayerEventSchema, { pid: 'a', type: 'shutter', round: 1 })).toBe(false);
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

  it('無い部屋と壊れた JSON は null', () => {
    expect(loadGm('999999')).toBeNull();
    store.set('sh:gm:123456', '{broken');
    expect(loadGm('123456')).toBeNull();
    store.set('sh:gm:123456', '42');
    expect(loadGm('123456')).toBeNull();
  });
});

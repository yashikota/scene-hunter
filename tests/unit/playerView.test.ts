import { describe, expect, test } from 'vite-plus/test';
import type { GmEvent, GmSnapshot } from '../../src/shared/protocol';
import { applyEvent, applySnapshot, hasGap, initialView } from '../../src/client/game/playerView';

type Body = GmEvent extends infer E ? (E extends unknown ? Omit<E, 'pid' | 'seq' | 'epoch'> : never) : never;
const ev = (seq: number, b: Body): GmEvent => ({ pid: 'gm', seq, epoch: 1, ...b }) as GmEvent;

const lobby = (seq = 0, locale: 'ja' | 'en' = 'ja') =>
  ev(seq, {
    type: 'lobby',
    players: [
      { pid: 'a', name: 'A', label: 'A1' },
      { pid: 'b', name: 'B', label: 'B1' },
    ],
    gmPid: 'gm',
    locale,
    rounds: 3,
    limitSec: 60,
  });

describe('playerView', () => {
  test('lobby でプレイヤーと locale が入る', () => {
    const v = applyEvent(initialView(), lobby(0, 'en'), 0);
    expect(v.phase).toBe('lobby');
    expect(v.locale).toBe('en');
    expect(v.players.map((p) => [p.pid, p.rank])).toEqual([
      ['a', null],
      ['b', null],
    ]);
    expect(v.lastSeq).toBe(0);
  });

  test('player_turn で hints が空になり開始時刻が入る', () => {
    let v = applyEvent(initialView(), ev(0, { type: 'gm_turn', round: 1, gameId: 'g1' }), 5);
    expect(v.gameId).toBe('g1');
    v = applyEvent(v, ev(1, { type: 'player_turn', round: 1, limitSec: 60 }), 1000);
    expect(v.phase).toBe('playerTurn');
    expect(v.hints).toEqual([]);
    expect(v.turnStartedLocalAt).toBe(1000);
  });

  test('hint は増え、同じ index は重複しない', () => {
    let v = applyEvent(initialView(), ev(0, { type: 'player_turn', round: 1, limitSec: 60 }), 0);
    v = applyEvent(v, ev(1, { type: 'hint', round: 1, index: 0, text: 'h0' }), 0);
    v = applyEvent(v, ev(2, { type: 'hint', round: 1, index: 0, text: 'dup' }), 0);
    v = applyEvent(v, ev(3, { type: 'hint', round: 1, index: 1, text: 'h1' }), 0);
    expect(v.hints).toEqual(['h0', 'h1']);
  });

  test('ranking で total と rank が更新される', () => {
    let v = applyEvent(initialView(), lobby(), 0);
    v = applyEvent(
      v,
      ev(1, {
        type: 'ranking',
        round: 1,
        scores: [],
        totals: [
          { pid: 'a', total: 80, rank: 2, delta: 0 },
          { pid: 'b', total: 120, rank: 1, delta: 0 },
        ],
      }),
      0,
    );
    expect(v.players.map((p) => [p.pid, p.total, p.rank])).toEqual([
      ['a', 80, 2],
      ['b', 120, 1],
    ]);
  });

  test('seq が飛ぶと hasGap が true、重複は無視される', () => {
    const v = applyEvent(initialView(), lobby(0), 0);
    expect(hasGap(v, ev(1, { type: 'hinting' }))).toBe(false);
    expect(hasGap(v, ev(2, { type: 'hinting' }))).toBe(true);
    expect(applyEvent(v, lobby(0, 'en'), 0)).toBe(v);
  });

  test('dissolved で phase が dissolved になる', () => {
    const v = applyEvent(initialView(), ev(0, { type: 'dissolved' }), 0);
    expect(v.phase).toBe('dissolved');
  });

  test('applySnapshot は経過時間から開始時刻を戻し lastSeq を合わせる', () => {
    const s: GmSnapshot = {
      pid: 'gm',
      seq: 9,
      epoch: 1,
      type: 'snapshot',
      phase: 'playerTurn',
      round: 2,
      rounds: 3,
      limitSec: 60,
      locale: 'ja',
      players: [{ pid: 'a', name: 'A', label: 'A1' }],
      gmPid: 'gm',
      gameId: 'g2',
      hints: ['h0'],
      turnElapsedMs: 4000,
      submitted: ['a'],
      results: null,
      ranking: {
        round: 1,
        scores: [],
        totals: [{ pid: 'a', total: 50, rank: 1, delta: 0 }],
      },
      final: null,
    };
    const v = applySnapshot(initialView(), s, 10000);
    expect(v.turnStartedLocalAt).toBe(6000);
    expect(v.lastSeq).toBe(9);
    expect(v.gameId).toBe('g2');
    expect(v.players[0]).toMatchObject({ total: 50, rank: 1 });
    expect(applySnapshot(v, { ...s, turnElapsedMs: null }, 10000).turnStartedLocalAt).toBeNull();
  });
});

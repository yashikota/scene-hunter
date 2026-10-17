import { describe, expect, it } from 'vite-plus/test';
import { scoreRound, speedMultiplier, streakBonus } from '../../src/shared/scoring';

const T = 60_000;

const expectPoints = (
  picks: string[],
  tMs: Record<string, number>,
  pid: string,
  points: number,
) => {
  const r = scoreRound({ picks, tMs, limitMs: T, prevStreak: {}, participants: Object.keys(tMs) });
  expect(r.find((s) => s.pid === pid)?.points).toBe(points);
};

describe('scoring', () => {
  it('rank1 at 6s = 950', () => expectPoints(['a'], { a: 6000 }, 'a', 950));
  it('rank1 at 45s = 625', () => expectPoints(['a'], { a: 45000 }, 'a', 625));
  it('rank2 at 12s = 630', () => expectPoints(['x', 'a'], { x: 1, a: 12000 }, 'a', 630));
  it('rank3 at 30s = 300', () =>
    expectPoints(['x', 'y', 'a'], { x: 1, y: 1, a: 30000 }, 'a', 300));

  it('t is clamped to [0, T]', () => {
    expect(speedMultiplier(-5, T)).toBe(1);
    expect(speedMultiplier(T + 9999, T)).toBe(0.5);
  });

  it('streak bonus', () => {
    expect([1, 2, 3, 6, 9].map(streakBonus)).toEqual([0, 100, 200, 500, 500]);
  });

  it('3rd consecutive pick, rank1 at 6s = 950 + 200', () => {
    const r = scoreRound({
      picks: ['a'],
      tMs: { a: 6000 },
      limitMs: T,
      prevStreak: { a: 2 },
      participants: ['a'],
    });
    expect(r[0]).toMatchObject({ rank: 1, points: 950, bonus: 200, streak: 3 });
  });

  it('not picked: 0 points, 0 bonus, streak resets', () => {
    const r = scoreRound({
      picks: [],
      tMs: { a: 6000 },
      limitMs: T,
      prevStreak: { a: 4 },
      participants: ['a'],
    });
    expect(r[0]).toMatchObject({ rank: null, points: 0, bonus: 0, streak: 0 });
  });

  it('throws RangeError when picks has more than 3 entries', () => {
    expect(() =>
      scoreRound({
        picks: ['a', 'b', 'c', 'd'],
        tMs: { a: 1, b: 2, c: 3, d: 4 },
        limitMs: T,
        prevStreak: {},
        participants: ['a', 'b', 'c', 'd'],
      }),
    ).toThrow(RangeError);
  });

  it('throws RangeError when picks has duplicate pids', () => {
    expect(() =>
      scoreRound({
        picks: ['a', 'a'],
        tMs: { a: 1 },
        limitMs: T,
        prevStreak: {},
        participants: ['a'],
      }),
    ).toThrow(RangeError);
  });

  it('throws Error when a picked participant has no tMs', () => {
    expect(() =>
      scoreRound({
        picks: ['a'],
        tMs: {},
        limitMs: T,
        prevStreak: {},
        participants: ['a'],
      }),
    ).toThrow(Error);
  });

  it('returns one entry per participant, in participants order', () => {
    const r = scoreRound({
      picks: ['b', 'a'],
      tMs: { a: 0, b: 60_000 },
      limitMs: T,
      prevStreak: {},
      participants: ['a', 'c', 'b'],
    });
    expect(r.map((s) => s.pid)).toEqual(['a', 'c', 'b']);
    expect(r[0]).toMatchObject({ rank: 2, points: 700, streak: 1 });
    expect(r[1]).toMatchObject({ rank: null, tMs: null, multiplier: null, streak: 0 });
    expect(r[2]).toMatchObject({ rank: 1, points: 500, multiplier: 0.5 });
  });
});

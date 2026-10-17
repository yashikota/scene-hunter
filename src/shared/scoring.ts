export const BASE_POINTS = [1000, 700, 400] as const;

export function speedMultiplier(tMs: number, limitMs: number): number {
  const t = Math.min(Math.max(tMs, 0), limitMs);
  return 1 - (0.5 * t) / limitMs;
}

export function streakBonus(streak: number): number {
  return Math.max(0, Math.min(streak - 1, 5)) * 100;
}

export interface RoundScore {
  pid: string;
  rank: 1 | 2 | 3 | null;
  tMs: number | null;
  multiplier: number | null;
  points: number;
  bonus: number;
  streak: number;
}

export function scoreRound(input: {
  picks: string[];
  tMs: Record<string, number>;
  limitMs: number;
  prevStreak: Record<string, number>;
  participants: string[];
}): RoundScore[] {
  const { picks, tMs, limitMs, prevStreak, participants } = input;

  if (picks.length > BASE_POINTS.length) {
    throw new RangeError(
      `scoreRound: picks has ${picks.length} entries, max is ${BASE_POINTS.length}`,
    );
  }
  if (new Set(picks).size !== picks.length) {
    throw new RangeError('scoreRound: picks contains duplicate pids');
  }

  return participants.map((pid) => {
    const index = picks.indexOf(pid);
    const picked = index !== -1;
    const t = tMs[pid] ?? null;

    if (!picked) {
      return { pid, rank: null, tMs: t, multiplier: null, points: 0, bonus: 0, streak: 0 };
    }

    if (t === null) {
      throw new Error(`scoreRound: picked participant ${pid} has no tMs`);
    }

    const multiplier = speedMultiplier(t, limitMs);
    const base = BASE_POINTS[index] ?? 0;
    const rank = index < BASE_POINTS.length ? ((index + 1) as 1 | 2 | 3) : null;
    const streak = (prevStreak[pid] ?? 0) + 1;

    return {
      pid,
      rank,
      tMs: t,
      multiplier,
      points: Math.round(base * multiplier),
      bonus: streakBonus(streak),
      streak,
    };
  });
}

import type { Total } from "../../shared/protocol";
import type { RoundScore } from "../../shared/scoring";
import { AnimatePresence } from "motion/react";
import * as mo from "motion/react-m";
import { useEffect, useRef, useState } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { formatMultiplier, formatNumber } from "../ui/format";
import { Screen } from "../ui/Screen";
import { TopBar } from "../ui/TopBar";
import { RoomBadge } from "../ui/RoomCode";
import { burstFrom } from "../ui/confetti";
import { CountUp, SMOOTH, SPRING, useStill } from "../ui/motion";
import { Thumb } from "./ResultsParts";

/** 選ばれた写真を 3 位から順に出す間（秒）。1 位の前だけ少し溜める。 */
const REVEAL_GAP = 0.8;
const FIRST_PAUSE = 0.4;

/** rank 位のカードを出すまでの秒数。picked は選ばれた枚数。 */
function revealDelay(rank: number, picked: number): number {
  const order = picked - rank; // 最下位が 0
  return 0.3 + order * REVEAL_GAP + (rank === 1 && picked > 1 ? FIRST_PAUSE : 0);
}

export interface RevealPlayer {
  pid: string;
  label: string;
  /** 部屋を出た人。順位には残し、名前に「退出」を添える。 */
  left?: boolean;
}

export interface ResultsRevealProps {
  code: string;
  round: number;
  rounds: number;
  scores: readonly RoundScore[];
  totals: readonly Total[];
  /** 名前の引き当て用。 */
  players: readonly RevealPlayer[];
  /** 写真の引き当て用（pid → url）。 */
  photoUrls: Readonly<Record<string, string>>;
  mePid: string;
  isGm: boolean;
  onNext(): void;
}

/** 中間結果の得点と順位。撮影秒数は GM が選び終えたここで初めて出す。 */
export function ResultsReveal({
  code,
  round,
  rounds,
  scores,
  totals,
  players,
  photoUrls,
  mePid,
  isGm,
  onNext,
}: ResultsRevealProps) {
  const label = (pid: string) => {
    const p = players.find((x) => x.pid === pid);
    return p ? (p.left ? `${p.label} · ${m.status_left()}` : p.label) : "";
  };
  const named = (pid: string) => (pid === mePid ? m.you_tag({ name: label(pid) }) : label(pid));
  const picked = scores.filter((s) => s.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const mine = scores.find((s) => s.pid === mePid);
  const last = round >= rounds;
  const still = useStill();
  // 選ばれた写真をすべて出し終えたら、合計の順位を前のラウンドの並びから今の並びへ入れ替える
  const settleAt = picked.length === 0 ? 0.4 : revealDelay(1, picked.length) + 0.9;
  const [settled, setSettled] = useState(still);
  useEffect(() => {
    if (still) {
      setSettled(true);
      return;
    }
    const id = setTimeout(() => setSettled(true), settleAt * 1000);
    return () => clearTimeout(id);
  }, [still, settleAt]);
  const gained = (pid: string) => scores.find((x) => x.pid === pid)?.points ?? 0;
  const ordered = settled
    ? totals
    : [...totals].sort((a, b) => a.rank + a.delta - (b.rank + b.delta));
  const after = still ? 0 : settleAt;
  return (
    <Screen>
      <TopBar left={m.round_label({ round, rounds })} right={<RoomBadge code={code} />} />
      <mo.h1
        className="sh-display"
        style={{ fontSize: 22 }}
        initial={{ scale: 0.6, opacity: 0, rotate: -4 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={SPRING}
      >
        {m.round_result_title({ round })}
      </mo.h1>

      {picked.length === 0 ? (
        <p className="sh-sub" style={{ margin: 0, fontSize: 14 }}>
          {m.no_picks()}
        </p>
      ) : (
        <ol
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            margin: 0,
            padding: 0,
            listStyle: "none",
          }}
        >
          {picked.map((s) => (
            <PickedCard
              key={s.pid}
              score={s}
              delay={still ? 0 : revealDelay(s.rank!, picked.length)}
              name={named(s.pid)}
              url={photoUrls[s.pid]}
            />
          ))}
        </ol>
      )}
      {mine && mine.rank === null && (
        <mo.p
          className="sh-sub"
          style={{ margin: 0, fontSize: 14, fontWeight: 800 }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: after }}
        >
          {m.not_picked_me()}
        </mo.p>
      )}

      <Card style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 800 }}>{m.total_heading()}</h2>
        <ol className="sh-totals">
          {ordered.map((t) => (
            <mo.li
              key={t.pid}
              layout
              transition={SMOOTH}
              className={`sh-total-row ${t.pid === mePid ? "is-me" : ""}`}
            >
              <span style={{ fontWeight: 800 }}>{settled ? t.rank : t.rank + t.delta}</span>
              <span style={{ overflowWrap: "anywhere" }}>{named(t.pid)}</span>
              <span style={{ textAlign: "right" }}>
                <CountUp
                  from={t.total - gained(t.pid)}
                  to={t.total}
                  delay={Math.max(after - 0.9, 0)}
                  format={formatNumber}
                />
              </span>
              <AnimatePresence>
                {settled && (
                  <mo.span
                    initial={{ scale: 0, y: 6 }}
                    animate={{ scale: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.25 }}
                    style={{ display: "block" }}
                  >
                    <Delta delta={t.delta} />
                  </mo.span>
                )}
              </AnimatePresence>
            </mo.li>
          ))}
        </ol>
      </Card>

      <mo.div
        className="sh-actions"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SMOOTH, delay: after }}
      >
        {isGm ? (
          <Button variant="primary" onClick={onNext}>
            {last ? m.see_final_button() : m.next_round_button()}
          </Button>
        ) : (
          <p
            className="sh-sub"
            role="status"
            style={{ margin: 0, fontSize: 14, textAlign: "center" }}
          >
            {m.wait_next_gm()}
          </p>
        )}
      </mo.div>
    </Screen>
  );
}

/** 選ばれた 1 枚。横から滑り込み、1 位は大きく叩きつけて紙吹雪を出す。 */
function PickedCard({
  score: s,
  delay,
  name,
  url,
}: {
  score: RoundScore;
  delay: number;
  name: string;
  url?: string;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const first = s.rank === 1;
  return (
    <mo.li
      ref={ref}
      className={`sh-picked sh-picked--${s.rank}`}
      initial={first ? { opacity: 0, scale: 1.6, rotate: -6 } : { opacity: 0, x: 90, rotate: 5 }}
      animate={{ opacity: 1, scale: 1, x: 0, rotate: 0 }}
      transition={
        first ? { type: "spring", stiffness: 520, damping: 18, delay } : { ...SPRING, delay }
      }
      onAnimationComplete={() => first && burstFrom(ref.current)}
    >
      <span className="sh-display sh-picked-rank">
        <span aria-hidden="true">{s.rank}</span>
        <span className="sh-sr-only">{m.rank_label({ rank: s.rank! })}</span>
      </span>
      <Thumb url={url} height={56} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 800, overflowWrap: "anywhere" }}>
          {name}
          {s.bonus > 0 && (
            <mo.span
              className="sh-streak"
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...SPRING, delay: delay + 0.45 }}
            >
              {m.streak_badge({ streak: s.streak, bonus: formatNumber(s.bonus) })}
            </mo.span>
          )}
        </span>
        <span className="sh-sub" style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
          {m.score_detail({
            sec: Math.round((s.tMs ?? 0) / 1000),
            multiplier: formatMultiplier(s.multiplier ?? 0),
            points: formatNumber(s.points),
          })}
        </span>
      </div>
    </mo.li>
  );
}

function Delta({ delta }: { delta: number }) {
  const text = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : "−";
  const label =
    delta > 0
      ? m.rank_up({ count: delta })
      : delta < 0
        ? m.rank_down({ count: -delta })
        : m.rank_same();
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 800,
        textAlign: "right",
        color: delta > 0 ? "var(--color-timer)" : "var(--color-sub)",
      }}
    >
      <span aria-hidden="true">{text}</span>
      <span className="sh-sr-only">{label}</span>
    </span>
  );
}

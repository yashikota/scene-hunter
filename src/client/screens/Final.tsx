import type { Total } from "../../shared/protocol";
import * as mo from "motion/react-m";
import { useEffect } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { formatNumber } from "../ui/format";
import { Screen } from "../ui/Screen";
import { TopBar } from "../ui/TopBar";
import { RoomBadge } from "../ui/RoomCode";
import { celebrate } from "../ui/confetti";
import { CountUp, SMOOTH, SPRING, useStill } from "../ui/motion";
import type { RevealPlayer } from "./ResultsReveal";

export interface FinalProps {
  code: string;
  rounds: number;
  /** 合計の降順。 */
  totals: readonly Total[];
  players: readonly RevealPlayer[];
  mePid: string;
  isGm: boolean;
  onBackToLobby(): void;
  onLeave(): void;
}

// 表彰台は 2・1・3 の順に並べる。高さは 1 位が一番高い。台は 3 位、2 位、1 位の順に伸ばす（at は秒）。
const PODIUM = [
  { index: 1, height: 96, bg: "var(--color-surface)", at: 1.0 },
  { index: 0, height: 128, bg: "var(--color-gold)", at: 1.9 },
  { index: 2, height: 72, bg: "var(--color-surface)", at: 0.3 },
] as const;
/** 表彰台を順位の順に並べ、見た目の列（1 から）を添える。 */
const PODIUM_BY_RANK = PODIUM.map((p, i) => ({ ...p, column: i + 1 })).sort(
  (a, b) => a.index - b.index,
);
/** 1 位の台が伸びきって、紙吹雪を出すまでの秒数。 */
const CHAMPION_AT = 2.5;

/** 最終結果：上位 3 人の表彰台と、それ以降の順位。 */
export function Final({
  code,
  rounds,
  totals,
  players,
  mePid,
  isGm,
  onBackToLobby,
  onLeave,
}: FinalProps) {
  const name = (pid: string) => {
    const p = players.find((x) => x.pid === pid);
    // 途中で出た人も、それまでの得点で順位に残る
    const label = p ? (p.left ? `${p.label} · ${m.status_left()}` : p.label) : "";
    return pid === mePid ? m.you_tag({ name: label }) : label;
  };
  const rest = totals.slice(3);
  const still = useStill();
  const at = (sec: number) => (still ? 0 : sec);
  useEffect(() => {
    let stop = () => {};
    const id = setTimeout(() => (stop = celebrate(3600)), CHAMPION_AT * 1000);
    return () => {
      clearTimeout(id);
      stop();
    };
  }, []);
  return (
    <Screen>
      <TopBar left={m.rounds_done({ rounds })} right={<RoomBadge code={code} />} />
      <mo.h1
        className="sh-display sh-final-title"
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 14 }}
      >
        {m.final_title()}
      </mo.h1>

      <ol
        aria-label={m.final_title()}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
          alignItems: "end",
          margin: 0,
          padding: 0,
          listStyle: "none",
        }}
      >
        {PODIUM_BY_RANK.map(({ index, height, bg, at: rise, column }) => {
          const t = totals[index];
          // 読み上げは 1 位から。見た目の 2・1・3 の並びは、列の指定で作る
          const place = { gridColumn: column, gridRow: 1 };
          if (!t) return <li key={index} aria-hidden="true" style={place} />;
          return (
            <li
              key={t.pid}
              style={{
                ...place,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                textAlign: "center",
                minWidth: 0,
              }}
            >
              <span className="sh-sr-only">
                {m.rank_points({ rank: t.rank, points: formatNumber(t.total) })} {name(t.pid)}
              </span>
              {index === 0 && (
                <mo.svg
                  viewBox="0 0 40 26"
                  width={40}
                  height={26}
                  aria-hidden="true"
                  className="sh-crown"
                  initial={{ y: -60, opacity: 0, rotate: -30 }}
                  animate={{ y: 0, opacity: 1, rotate: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 12,
                    delay: at(CHAMPION_AT),
                  }}
                >
                  <path d="M3 22 L6 6 L14 14 L20 3 L26 14 L34 6 L37 22 Z" />
                  <circle cx={20} cy={3} r={2.5} />
                  <circle cx={6} cy={6} r={2.5} />
                  <circle cx={34} cy={6} r={2.5} />
                </mo.svg>
              )}
              <mo.span
                aria-hidden="true"
                style={{ fontSize: 14, fontWeight: 800, overflowWrap: "anywhere" }}
                initial={{ opacity: 0, y: -14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: at(rise + 0.35) }}
              >
                {name(t.pid)}
              </mo.span>
              <mo.span
                aria-hidden="true"
                className="sh-display"
                style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: at(rise) }}
              >
                <CountUp
                  from={0}
                  to={t.total}
                  delay={at(rise)}
                  duration={0.9}
                  format={formatNumber}
                />
              </mo.span>
              <mo.div
                className={`sh-display sh-podium ${index === 0 ? "sh-podium--1" : ""}`}
                aria-hidden="true"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 16, delay: at(rise) }}
                style={{
                  width: "100%",
                  height,
                  background: bg,
                  border: "var(--border)",
                  borderRadius: "12px 12px 0 0",
                  boxShadow: "var(--shadow)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  paddingTop: 8,
                  fontSize: 28,
                }}
              >
                {t.rank}
              </mo.div>
            </li>
          );
        })}
      </ol>

      {rest.length > 0 && (
        <mo.ol
          start={4}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SMOOTH, delay: at(CHAMPION_AT + 0.4) }}
          style={{
            display: "grid",
            gridTemplateColumns: "28px minmax(0, 1fr) auto",
            gap: 8,
            margin: 0,
            padding: "12px 14px",
            listStyle: "none",
            background: "var(--color-surface)",
            border: "var(--border)",
            borderRadius: "var(--radius-lg)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {rest.map((t) => (
            <li
              key={t.pid}
              style={{ display: "contents", fontWeight: t.pid === mePid ? 800 : 500 }}
            >
              <span style={{ fontWeight: 800 }}>{t.rank}</span>
              <span style={{ overflowWrap: "anywhere" }}>{name(t.pid)}</span>
              <span>{formatNumber(t.total)}</span>
            </li>
          ))}
        </mo.ol>
      )}

      <mo.div
        className="sh-actions"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SMOOTH, delay: at(CHAMPION_AT + 0.6) }}
      >
        {isGm ? (
          <Button variant="primary" onClick={onBackToLobby}>
            {m.back_to_lobby()}
          </Button>
        ) : (
          <>
            <p
              className="sh-sub"
              role="status"
              style={{ margin: 0, fontSize: 14, textAlign: "center" }}
            >
              {m.final_wait_note()}
            </p>
            <Button variant="quiet" onClick={onLeave}>
              {m.leave_button()}
            </Button>
          </>
        )}
      </mo.div>
    </Screen>
  );
}

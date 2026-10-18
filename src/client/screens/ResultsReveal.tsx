import type { Total } from "../../shared/protocol";
import type { RoundScore } from "../../shared/scoring";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { formatMultiplier, formatNumber } from "../ui/format";
import { Screen } from "../ui/Screen";
import { TopBar } from "../ui/TopBar";
import { RoomBadge } from "../ui/RoomCode";
import { Thumb } from "./ResultsParts";

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
  return (
    <Screen>
      <TopBar left={m.round_label({ round, rounds })} right={<RoomBadge code={code} />} />
      <h1 className="sh-display" style={{ fontSize: 22 }}>
        {m.round_result_title({ round })}
      </h1>

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
            <li
              key={s.pid}
              style={{
                background: "var(--color-surface)",
                border: "var(--border)",
                borderRadius: 12,
                boxShadow: `4px 4px 0 ${s.rank === 1 ? "var(--color-ink)" : s.rank === 2 ? "var(--color-accent)" : "transparent"}`,
                padding: 8,
                display: "grid",
                gridTemplateColumns: "30px 56px minmax(0, 1fr)",
                gap: 10,
                alignItems: "center",
              }}
            >
              <span
                aria-label={m.rank_label({ rank: s.rank! })}
                className="sh-display"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: s.rank === 1 ? "var(--color-gold)" : "var(--color-surface)",
                  border: "var(--border)",
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {s.rank}
              </span>
              <Thumb url={photoUrls[s.pid]} alt={label(s.pid)} height={56} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 800, overflowWrap: "anywhere" }}>
                  {named(s.pid)}
                  {s.bonus > 0 && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 11,
                        background: "var(--color-ink)",
                        color: "var(--color-gold)",
                        borderRadius: 999,
                        padding: "1px 7px",
                        verticalAlign: 2,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.streak_badge({ streak: s.streak, bonus: formatNumber(s.bonus) })}
                    </span>
                  )}
                </span>
                <span
                  className="sh-sub"
                  style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}
                >
                  {m.score_detail({
                    sec: Math.round((s.tMs ?? 0) / 1000),
                    multiplier: formatMultiplier(s.multiplier ?? 0),
                    points: formatNumber(s.points),
                  })}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {mine && mine.rank === null && (
        <p className="sh-sub" style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
          {m.not_picked_me()}
        </p>
      )}

      <Card style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 800 }}>{m.total_heading()}</h2>
        <ol
          style={{
            display: "grid",
            gridTemplateColumns: "24px minmax(0, 1fr) auto 44px",
            gap: 8,
            alignItems: "center",
            margin: 0,
            padding: 0,
            listStyle: "none",
            fontSize: 15,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {totals.map((t) => (
            <li
              key={t.pid}
              style={{ display: "contents", fontWeight: t.pid === mePid ? 800 : 500 }}
            >
              <span style={{ fontWeight: 800 }}>{t.rank}</span>
              <span style={{ overflowWrap: "anywhere" }}>{named(t.pid)}</span>
              <span>{formatNumber(t.total)}</span>
              <Delta delta={t.delta} />
            </li>
          ))}
        </ol>
      </Card>

      <div className="sh-actions">
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
      </div>
    </Screen>
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
      aria-label={label}
      style={{
        fontSize: 12,
        fontWeight: 800,
        textAlign: "right",
        color: delta > 0 ? "var(--color-timer)" : "var(--color-sub)",
      }}
    >
      {text}
    </span>
  );
}

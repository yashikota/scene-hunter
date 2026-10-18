import { useState } from "react";
import { m } from "../paraglide/messages";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { formatCode, TopBar } from "../ui/TopBar";
import { useNow } from "../ui/useNow";
import { GM_TURN_SEC, remainingSec } from "./turnTime";

export interface GmTurnPlayerProps {
  code: string;
  round: number;
  rounds: number;
  gmName: string;
  me: { label: string; total: number; rank: number | null };
}

/** プレイヤーから見た GM のターン。この画面を開いてからの時間でカウントダウンを出す（GM の画面と目安は同じ 60 秒）。 */
export function GmTurnPlayer({ code, round, rounds, gmName, me }: GmTurnPlayerProps) {
  const [openedAt] = useState(() => Date.now());
  const now = useNow();
  return (
    <Screen>
      <TopBar
        left={m.round_label({ round, rounds })}
        right={<span>{m.room_badge({ code: formatCode(code) })}</span>}
      />
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          textAlign: "center",
        }}
      >
        <span className="sh-timer" role="timer" style={{ fontSize: 64 }}>
          {remainingSec(openedAt, GM_TURN_SEC, now)}
          <small> {m.sec_suffix()}</small>
        </span>
        <h1 className="sh-display sh-pre" style={{ fontSize: 22, lineHeight: 1.5 }}>
          {m.gm_preparing({ name: gmName })}
        </h1>
        <p className="sh-sub sh-pre" style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
          {m.gm_turn_player_note()}
        </p>
      </div>
      <Card
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          background: "var(--color-accent)",
        }}
      >
        <span className="sh-display" style={{ fontSize: 20 }}>
          {me.rank ?? "–"}
        </span>
        <span style={{ flexGrow: 1, fontWeight: 800, overflowWrap: "anywhere" }}>
          {m.you_tag({ name: me.label })}
        </span>
        <span style={{ fontWeight: 800 }}>
          {m.points_value({ count: me.total.toLocaleString() })}
        </span>
      </Card>
    </Screen>
  );
}

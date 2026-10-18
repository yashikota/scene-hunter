import { m } from "../paraglide/messages";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { TopBar } from "../ui/TopBar";
import { useNow } from "../ui/useNow";
import { HintList } from "./HintList";
import { remainingSec } from "./turnTime";

export interface PlayerTurnGmProps {
  round: number;
  rounds: number;
  limitSec: number;
  turnStartedLocalAt: number | null;
  /** GM は 5 つとも知っている。公開済みでないものは「あと N 秒で公開」を添える。 */
  hints: readonly string[];
  /** 公開済みのヒントの数。 */
  shown: number;
  /** GM が撮った（選んだ）お題の写真。再読み込みなどで手元に無いときは undefined。 */
  photoUrl?: string;
  /** GM を除くプレイヤー。 */
  players: readonly { pid: string; label: string; away?: boolean; left?: boolean }[];
  submitted: readonly string[];
}

/** プレイヤーのターン中の GM の画面：お題の写真、出ているヒント、提出状況。 */
export function PlayerTurnGm(props: PlayerTurnGmProps) {
  const {
    round,
    rounds,
    limitSec,
    turnStartedLocalAt,
    hints,
    shown,
    photoUrl,
    players,
    submitted,
  } = props;
  const now = useNow();
  // 数えるのは提出した人と、つながっている人（通信が切れたらしい人は待たない）。
  const counted = players.filter((p) => (!p.away && !p.left) || submitted.includes(p.pid));
  const done = counted.filter((p) => submitted.includes(p.pid)).length;
  return (
    <Screen>
      <TopBar
        left={m.round_label({ round, rounds })}
        right={<span className="sh-badge">{m.you_are_gm()}</span>}
      />
      <Card raised style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
        <div
          style={{
            aspectRatio: "4 / 3",
            borderRadius: "var(--radius-sm)",
            border: "var(--border)",
            background: "var(--color-bg)",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={m.topic_photo()}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span className="sh-sub" style={{ fontSize: 13, padding: 12 }}>
              {m.topic_photo_missing()}
            </span>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontWeight: 800 }}>{m.photo_taking()}</span>
          <span className="sh-timer" role="timer" style={{ fontSize: 28 }}>
            {remainingSec(turnStartedLocalAt, limitSec, now)}
            <small> {m.sec_suffix()}</small>
          </span>
        </div>
        <p className="sh-sub" style={{ margin: 0, fontSize: 13, textAlign: "center" }}>
          {m.keep_screen_on()}
        </p>
      </Card>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 className="sh-display" style={{ fontSize: 17 }}>
          {m.hints_heading()}
        </h2>
        <HintList hints={hints} shown={shown} turnStartedLocalAt={turnStartedLocalAt} now={now} />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 className="sh-display" style={{ fontSize: 17 }}>
            {m.submissions_heading()}
          </h2>
          <span className="sh-sub" style={{ fontSize: 13 }}>
            {m.people_ratio({ done, total: counted.length })}
          </span>
        </div>
        <ul className="sh-tiles">
          {players.map((p) => {
            const ok = submitted.includes(p.pid);
            const gone = p.away || p.left;
            return (
              <li
                key={p.pid}
                className={`sh-tile ${ok ? "sh-tile--me" : gone ? "sh-tile--away" : ""}`}
              >
                <span>{p.label}</span>{" "}
                <span style={{ fontSize: 12 }}>
                  {ok
                    ? m.status_submitted()
                    : p.left
                      ? m.status_left()
                      : p.away
                        ? m.status_away()
                        : m.status_shooting()}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </Screen>
  );
}

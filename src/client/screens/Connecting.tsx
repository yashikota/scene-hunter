import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Screen } from "../ui/Screen";

export type WaitKind = "connecting" | "preparing" | "claiming" | "rejoining" | "claimFailed";

const TITLE: Record<WaitKind, () => string> = {
  connecting: () => m.connecting_title(),
  // できたばかりの部屋がまだ見えない間（join の 404 を待ち直している間）
  preparing: () => m.preparing_title(),
  claiming: () => m.claiming_title(),
  rejoining: () => m.rejoining_title(),
  claimFailed: () => m.claim_failed_title(),
};

/** 部屋が見えるようになるまでの目安（最大 60 秒）。バーはこの時間で伸び切る。 */
export const PREPARING_FILL_SEC = 50;

/**
 * 部屋につなぐまで、または GM の交代の途中の待ち。文は出さず、題と動きだけにする。
 * preparing は時間で伸びるバーを出す。onLeave を渡すと「部屋を出る」を出す。
 */
export function Connecting({
  kind,
  preparing = false,
  onLeave,
}: {
  kind?: WaitKind;
  preparing?: boolean;
  onLeave?: () => void;
}) {
  const k = kind ?? (preparing ? "preparing" : "connecting");
  const failed = k === "claimFailed";
  return (
    <Screen>
      <div role={failed ? "alert" : "status"} className="sh-center">
        {k === "preparing" ? (
          <span className="sh-bar sh-bar--wide" aria-hidden="true">
            <span
              className="sh-bar-fill sh-fill-over"
              style={{ animationDuration: `${PREPARING_FILL_SEC}s` }}
            />
          </span>
        ) : (
          <div
            className="sh-icon-tile"
            style={{ width: 88, height: 88, background: "var(--color-surface)", borderRadius: 22 }}
          >
            <span
              className={failed ? undefined : "sh-pulse"}
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: failed ? "var(--color-gold)" : "var(--color-timer)",
                border: "var(--border)",
              }}
            />
          </div>
        )}
        <h1 className="sh-display" style={{ fontSize: 24, lineHeight: 1.4 }}>
          {TITLE[k]()}
        </h1>
        {failed && (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>{m.claim_failed_body()}</p>
        )}
      </div>
      {onLeave && (
        <Button variant="quiet" onClick={onLeave}>
          {m.leave_button()}
        </Button>
      )}
    </Screen>
  );
}

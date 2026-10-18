import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Screen } from "../ui/Screen";
import { TopBar } from "../ui/TopBar";
import { RoomBadge } from "../ui/RoomCode";

/** 部屋が閉じられた（GM が解散した）。 */
export function Dissolved({ code, onLeave }: { code: string; onLeave(): void }) {
  return (
    <Screen>
      <TopBar right={<RoomBadge code={code} />} />
      <h1
        role="status"
        className="sh-display"
        style={{ fontSize: 24, textAlign: "center", margin: "auto 0", lineHeight: 1.4 }}
      >
        {m.dissolved_title()}
      </h1>
      <Button variant="primary" onClick={onLeave}>
        {m.back_to_top()}
      </Button>
    </Screen>
  );
}

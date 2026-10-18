import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { TopBar } from "../ui/TopBar";
import { RoomBadge } from "../ui/RoomCode";
import { PlayerTiles, type LobbyMember } from "./LobbyGm";
import { RulesButton } from "./Rules";

export interface LobbyPlayerProps {
  code: string;
  me: LobbyMember;
  gmName: string;
  players: readonly LobbyMember[];
  rounds: number;
  limitSec: number;
  onLeave(): void;
}

export function LobbyPlayer({
  code,
  me,
  gmName,
  players,
  rounds,
  limitSec,
  onLeave,
}: LobbyPlayerProps) {
  return (
    <Screen>
      <TopBar right={<RoomBadge code={code} />} />

      <Card
        raised
        style={{
          padding: "22px 18px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          textAlign: "center",
        }}
      >
        <span className="sh-display sh-pre" style={{ fontSize: 22, lineHeight: 1.4 }}>
          {m.waiting_for_gm()}
        </span>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 8,
            marginTop: 4,
          }}
        >
          <span className="sh-chip">{m.rounds_chip({ count: rounds })}</span>
          <span className="sh-chip">{m.seconds({ count: limitSec })}</span>
        </div>
      </Card>

      <PlayerTiles gmName={gmName} players={players} meId={me.pid} />

      <div className="sh-actions">
        <div className="sh-row sh-row--even">
          <RulesButton rounds={rounds} limitSec={limitSec} />
          <Button variant="quiet" onClick={onLeave}>
            {m.leave_button()}
          </Button>
        </div>
      </div>
    </Screen>
  );
}

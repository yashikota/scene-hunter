import { m } from "../paraglide/messages";
import { LeaveButton } from "./LeaveButton";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { TopBar } from "../ui/TopBar";
import { RoomBadge } from "../ui/RoomCode";
import { PlayerTiles, type LobbyMember } from "./LobbyGm";
import { RulesButton } from "./Rules";

export interface LobbyPlayerProps {
  code: string;
  /** name は自分で付けた名前（名前を変えるシートに入れておく）。 */
  me: LobbyMember & { name: string };
  gmName: string;
  players: readonly LobbyMember[];
  rounds: number;
  limitSec: number;
  onLeave(): void;
  /** 自分の名前を変える。 */
  onRename(name: string): Promise<void>;
}

export function LobbyPlayer({
  code,
  me,
  gmName,
  players,
  rounds,
  limitSec,
  onLeave,
  onRename,
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
        <h1 className="sh-display sh-pre" style={{ fontSize: 22, lineHeight: 1.4 }}>
          {m.waiting_for_gm()}
        </h1>
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

      <PlayerTiles
        gmName={gmName}
        players={players}
        meId={me.pid}
        self={{ name: me.name, onRename }}
      />

      <div className="sh-actions">
        <div className="sh-row sh-row--even">
          <RulesButton rounds={rounds} limitSec={limitSec} />
          <LeaveButton onLeave={onLeave} />
        </div>
      </div>
    </Screen>
  );
}

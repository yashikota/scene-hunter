import { m } from '../paraglide/messages';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { formatCode, TopBar } from '../ui/TopBar';
import { PlayerTiles, type LobbyMember } from './LobbyGm';

export interface LobbyPlayerProps {
  code: string;
  me: LobbyMember;
  gmName: string;
  players: readonly LobbyMember[];
  rounds: number;
  limitSec: number;
  onLeave(): void;
}

export function LobbyPlayer({ code, me, gmName, players, rounds, limitSec, onLeave }: LobbyPlayerProps) {
  return (
    <Screen>
      <TopBar left={m.lobby_label()} right={<span>{m.room_badge({ code: formatCode(code) })}</span>} />

      <Card
        raised
        style={{
          padding: '22px 18px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          textAlign: 'center',
        }}
      >
        <span className="sh-sub" style={{ fontSize: 13, fontWeight: 800 }}>
          {m.joined_as({ name: me.label })}
        </span>
        <span className="sh-display sh-pre" style={{ fontSize: 22, lineHeight: 1.4 }}>
          {m.waiting_for_gm()}
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 }}>
          <span className="sh-chip">{m.rounds_chip({ count: rounds })}</span>
          <span className="sh-chip">{m.limit_chip({ count: limitSec })}</span>
        </div>
      </Card>

      <PlayerTiles gmName={gmName} players={players} meId={me.pid} />

      <Card style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{m.howto_heading()}</h2>
        <ol style={{ margin: 0, paddingLeft: '1.3em', fontSize: 14, lineHeight: 1.7 }}>
          <li>{m.howto_1()}</li>
          <li>{m.howto_2()}</li>
          <li>{m.howto_3()}</li>
        </ol>
      </Card>

      <Button variant="quiet" onClick={onLeave} style={{ marginTop: 'auto' }}>
        {m.leave_button()}
      </Button>
    </Screen>
  );
}

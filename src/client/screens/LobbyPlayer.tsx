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

/** 遊び方の 3 行（カメラ、電球、稲妻のアイコン）。 */
const HOWTO = [
  {
    icon: (
      <>
        <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
    text: () => m.howto_1(),
  },
  { icon: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />, text: () => m.howto_2() },
  { icon: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />, text: () => m.howto_3() },
];

export function LobbyPlayer({ code, me, gmName, players, rounds, limitSec, onLeave }: LobbyPlayerProps) {
  return (
    <Screen>
      <TopBar left={m.app_name()} right={<span>{m.room_badge({ code: formatCode(code) })}</span>} />

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
        <span className="sh-display sh-pre" style={{ fontSize: 22, lineHeight: 1.4 }}>
          {m.waiting_for_gm()}
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 }}>
          <span className="sh-chip">{m.rounds_chip({ count: rounds })}</span>
          <span className="sh-chip">{m.seconds({ count: limitSec })}</span>
        </div>
      </Card>

      <PlayerTiles gmName={gmName} players={players} meId={me.pid} />

      <ul className="sh-howto">
        {HOWTO.map(({ icon, text }, i) => (
          <li key={i}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {icon}
            </svg>
            {text()}
          </li>
        ))}
      </ul>

      <Button variant="quiet" onClick={onLeave} style={{ marginTop: 'auto' }}>
        {m.leave_button()}
      </Button>
    </Screen>
  );
}

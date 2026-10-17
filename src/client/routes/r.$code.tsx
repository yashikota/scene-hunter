import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { loadMe } from '../game/membership';
import { useRoom, type Room } from '../game/useRoom';
import { m } from '../paraglide/messages';
import { Connecting } from '../screens/Connecting';
import { LobbyGm } from '../screens/LobbyGm';
import { LobbyPlayer } from '../screens/LobbyPlayer';
import { Top } from '../screens/Top';
import { TurnScreen } from '../screens/TurnScreen';
import { Unsupported } from '../screens/Unsupported';
import { Button } from '../ui/Button';
import { isSupportedBrowser, useBrowserLocale } from '../ui/locale';
import { Screen } from '../ui/Screen';
import { formatCode, TopBar } from '../ui/TopBar';

export const Route = createFileRoute('/r/$code')({
  component: RoomRoute,
});

function RoomRoute() {
  const { code } = Route.useParams();
  // 番号が変わったら（このページから別の部屋を作ったときなど）状態を持ち越さない
  return <RoomEntry key={code} code={code} />;
}

function RoomEntry({ code }: { code: string }) {
  const navigate = useNavigate();
  const [entered, setEntered] = useState(() => loadMe(code) !== null);
  if (!isSupportedBrowser()) return <UnsupportedRoute />;
  // まだこの部屋に入っていない（共有されたリンクから来た）ときは、番号を入れたトップを出す。
  if (!entered) {
    return (
      <Top
        initialCode={code}
        onEntered={(c) => (c === code ? setEntered(true) : void navigate({ to: '/r/$code', params: { code: c } }))}
      />
    );
  }
  return <RoomScreen code={code} />;
}

function UnsupportedRoute() {
  useBrowserLocale();
  return <Unsupported />;
}

function RoomScreen({ code }: { code: string }) {
  const room = useRoom(code);
  const { view, actions } = room;
  if (room.status) {
    return (
      <Connecting
        kind={room.status}
        onLeave={room.status === 'claimFailed' ? () => void actions.leave() : undefined}
      />
    );
  }
  switch (view.phase) {
    case 'connecting':
      return <Connecting />;
    case 'lobby':
      return room.role === 'gm' ? (
        <LobbyGm
          code={code}
          gmName={room.gmName}
          players={view.players}
          rounds={view.rounds}
          limitSec={view.limitSec}
          onStart={actions.start}
          onTransfer={actions.transfer}
          onDissolve={() => void actions.dissolve()}
        />
      ) : (
        <LobbyPlayer
          code={code}
          me={room.me}
          gmName={room.gmName}
          players={view.players}
          rounds={view.rounds}
          limitSec={view.limitSec}
          onLeave={() => void actions.leave()}
        />
      );
    case 'dissolved':
      return <Placeholder room={room} code={code} title={m.dissolved_title()} />;
    case 'gmTurn':
    case 'hinting':
    case 'hintError':
    case 'playerTurn':
      return <TurnScreen room={room} code={code} />;
    default:
      // 中間結果以降の画面は Task 17 で差し替える。
      return <Placeholder room={room} code={code} title={m.in_progress()} />;
  }
}

/** まだ画面が無い段階の仮の表示。 */
function Placeholder({ room, code, title }: { room: Room; code: string; title: string }) {
  const dissolved = room.view.phase === 'dissolved';
  return (
    <Screen>
      <TopBar left={room.view.phase} right={<span>{m.room_badge({ code: formatCode(code) })}</span>} />
      <h1 className="sh-display" style={{ fontSize: 24, textAlign: 'center', margin: 'auto 0' }}>
        {title}
      </h1>
      <Button variant="quiet" onClick={() => void room.actions.leave()}>
        {dissolved ? m.back_to_top() : room.role === 'gm' ? m.dissolve_button() : m.leave_button()}
      </Button>
    </Screen>
  );
}

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { loadMe } from '../game/membership';
import { useRoom } from '../game/useRoom';
import { Connecting } from '../screens/Connecting';
import { Disconnected } from '../screens/Disconnected';
import { Dissolved } from '../screens/Dissolved';
import { LobbyGm } from '../screens/LobbyGm';
import { LobbyPlayer } from '../screens/LobbyPlayer';
import { ResultsScreen } from '../screens/ResultsScreen';
import { Top } from '../screens/Top';
import { TurnScreen } from '../screens/TurnScreen';
import { Unsupported } from '../screens/Unsupported';
import { isSupportedBrowser, useBrowserLocale } from '../ui/locale';

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
  if (room.gmDisconnectedSince !== null && view.phase !== 'connecting' && view.phase !== 'dissolved') {
    const mine = view.players.find((p) => p.pid === room.me.pid);
    return (
      <Disconnected
        code={code}
        round={view.round}
        rounds={view.rounds}
        gmName={room.gmName}
        since={room.gmDisconnectedSince}
        me={mine ? { rank: mine.rank, total: mine.total } : null}
        onLeave={() => void actions.leave()}
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
      return <Dissolved code={code} onLeave={() => void actions.leave()} />;
    case 'gmTurn':
    case 'hinting':
    case 'hintError':
    case 'playerTurn':
      return <TurnScreen room={room} code={code} />;
    case 'picking':
    case 'reveal':
    case 'final':
      return <ResultsScreen room={room} code={code} />;
    default:
      return <Connecting />;
  }
}

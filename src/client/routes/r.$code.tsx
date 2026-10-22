import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { m } from "../paraglide/messages";
import { isRoomFound, joinAndSave, loadMe } from "../game/membership";
import { useRoom } from "../game/useRoom";
import { Connecting } from "../screens/Connecting";
import { Disconnected } from "../screens/Disconnected";
import { Dissolved } from "../screens/Dissolved";
import { LobbyGm } from "../screens/LobbyGm";
import { LobbyPlayer } from "../screens/LobbyPlayer";
import { NameStep } from "../screens/NameStep";
import { ResultsScreen } from "../screens/ResultsScreen";
import { Top } from "../screens/Top";
import { ROOM_CODE_RE } from "../../shared/entry";
import { TurnScreen } from "../screens/TurnScreen";
import { Unsupported } from "../screens/Unsupported";
import { isSupportedBrowser, useBrowserLocale } from "../ui/locale";

export const Route = createFileRoute("/r/$code")({
  component: RoomRoute,
});

function RoomRoute() {
  const { code } = Route.useParams();
  // 部屋の番号は 6 桁の数字だけ。それ以外の URL はトップに回す
  if (!ROOM_CODE_RE.test(code)) return <Navigate to="/" replace />;
  // 番号が変わったら（このページから別の部屋を作ったときなど）状態を持ち越さない
  return <RoomEntry key={code} code={code} />;
}

function RoomEntry({ code }: { code: string }) {
  const navigate = useNavigate();
  const [entered, setEntered] = useState(() => loadMe(code) !== null);
  // まだ入っていない部屋。あると確かめた部屋なら名前を聞き、そうでなければ（共有された /r/{code} の
  // リンクから来たときなど）番号を入れたトップをこの URL のまま出して、そこで確かめてもらう。
  const [naming, setNaming] = useState(() => isRoomFound(code));
  if (!isSupportedBrowser()) return <UnsupportedRoute />;
  if (!entered) {
    if (!naming) {
      return (
        <Top
          initialCode={code}
          onEntered={(c) => {
            // 番号を打ち直したら、その部屋の URL へ移る
            if (c !== code) return void navigate({ to: "/r/$code", params: { code: c } });
            if (loadMe(c)) setEntered(true);
            else setNaming(true);
          }}
          onCreate={() => void navigate({ to: "/new" })}
        />
      );
    }
    return (
      // 言語はトップで決めたまま（ここへはトップから来る）
      <NameStep
        code={code}
        onSubmit={async (name, { onWaiting }) => {
          await joinAndSave(code, name, { onWaiting });
          setEntered(true);
        }}
        // 番号を入れたトップに戻る（確かめ済みなので、トップはそのまま留まる）
        onBack={() => setNaming(false)}
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
  return (
    <>
      <RoomView room={room} code={code} />
      {room.reconnecting && (
        <div role="status" className="sh-reconnecting">
          {m.reconnecting()}
        </div>
      )}
    </>
  );
}

function RoomView({ room, code }: { room: ReturnType<typeof useRoom>; code: string }) {
  const { view, actions } = room;
  if (room.status) {
    return (
      <Connecting
        kind={room.status}
        onLeave={room.status === "claimFailed" ? () => void actions.leave() : undefined}
      />
    );
  }
  if (
    room.gmDisconnectedSince !== null &&
    view.phase !== "connecting" &&
    view.phase !== "dissolved"
  ) {
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
    case "connecting":
      return <Connecting />;
    case "lobby":
      return room.role === "gm" ? (
        <LobbyGm
          code={code}
          gmName={room.gmName}
          players={view.players}
          rounds={view.rounds}
          limitSec={view.limitSec}
          onStart={actions.start}
          onTransfer={actions.transfer}
          onDissolve={() => void actions.dissolve()}
          onRename={actions.rename}
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
          onRename={actions.rename}
        />
      );
    case "dissolved":
      return <Dissolved code={code} onLeave={() => void actions.leave()} />;
    case "gmTurn":
    case "hinting":
    case "hintError":
    case "playerTurn":
      return <TurnScreen room={room} code={code} />;
    case "picking":
    case "reveal":
    case "final":
      return <ResultsScreen room={room} code={code} />;
    default:
      return <Connecting />;
  }
}

import type { Room } from "../game/useRoom";
import { m } from "../paraglide/messages";
import { Screen } from "../ui/Screen";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { RoomCode } from "../ui/RoomCode";
import { QRCodeSVG } from "qrcode.react";
import { shareLink, PlayerTiles } from "./LobbyGm";
import { useState } from "react";
import { ConfirmSheet } from "../ui/Sheet";
export function Admin({ room, code }: { room: Room; code: string }) {
  const [confirm, setConfirm] = useState(false);
  const [failed, setFailed] = useState(false);
  const { view, actions } = room;
  const phaseLabels: Record<string, string> = {
    lobby: m.players_heading(),
    gmTurn: m.gm_turn_badge(),
    hinting: m.hint_wait_title(),
    hintError: m.hint_error_title(),
    playerTurn: m.results_collecting(),
    picking: m.results_pick_title(),
    reveal: m.results_wait_title(),
    final: m.final_title(),
  };
  return (
    <Screen>
      <h1>{m.admin_title()}</h1>
      <Card>
        <RoomCode code={code} />
        <QRCodeSVG value={shareLink(code)} size={160} marginSize={4} />
        <p>
          {m.admin_phase({ phase: phaseLabels[view.phase] ?? m.reconnecting(), round: view.round })}
        </p>
      </Card>
      <PlayerTiles gmName={room.gmName} players={view.players} />
      {view.phase === "lobby" && (
        <Button
          disabled={view.players.filter((p) => !p.away && !p.left).length < 2}
          onClick={actions.start}
        >
          {m.start_button()}
        </Button>
      )}
      {view.phase === "reveal" && (
        <Button onClick={actions.nextRound}>{m.admin_next_round()}</Button>
      )}
      {view.phase === "final" && (
        <Button onClick={actions.backToLobby}>{m.admin_back_lobby()}</Button>
      )}
      <Button onClick={() => setConfirm(true)}>{m.dissolve_button()}</Button>
      <Button onClick={() => void actions.leave()}>{m.admin_leave()}</Button>
      {failed && (
        <p role="alert" className="sh-error">
          {m.error_failed()}
        </p>
      )}
      <ConfirmSheet
        open={confirm}
        title={m.dissolve_confirm()}
        confirmLabel={m.dissolve_button()}
        onConfirm={() => {
          setFailed(false);
          void actions.dissolve().catch(() => setFailed(true));
        }}
        onCancel={() => setConfirm(false)}
      />
    </Screen>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { Room } from '../game/useRoom';
import { GmTurn } from './GmTurn';
import { GmTurnPlayer } from './GmTurnPlayer';
import { HintError } from './HintError';
import { HintWait } from './HintWait';
import { PlayerTurn } from './PlayerTurn';
import { PlayerTurnGm } from './PlayerTurnGm';

/** GM のターンからプレイヤーのターンまでの画面を、役割と段階で選ぶ。 */
export function TurnScreen({ room, code }: { room: Room; code: string }) {
  const { view, actions, me, gmName } = room;
  const isGm = room.role === 'gm';
  const [gmPhotoUrl, setGmPhotoUrl] = useState<string>();
  const urlRef = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const common = { round: view.round, rounds: view.rounds };
  const others = view.players.filter((p) => p.pid !== view.gmPid);

  switch (view.phase) {
    case 'gmTurn':
      return isGm ? (
        <GmTurn
          {...common}
          onPhoto={async (blob) => {
            // プレイヤーのターンの間、GM の画面に出すお題の写真をこの端末に持っておく。
            if (urlRef.current) URL.revokeObjectURL(urlRef.current);
            urlRef.current = URL.createObjectURL(blob);
            setGmPhotoUrl(urlRef.current);
            await actions.shutter(blob);
          }}
        />
      ) : (
        <GmTurnPlayer
          {...common}
          code={code}
          gmName={gmName}
          me={view.players.find((p) => p.pid === me.pid) ?? { label: me.label, total: 0, rank: null }}
        />
      );
    case 'hinting':
      return <HintWait {...common} code={code} />;
    case 'hintError':
      return isGm ? (
        <HintError {...common} onRetry={actions.retryHints} onDissolve={() => void actions.dissolve()} />
      ) : (
        <HintWait {...common} code={code} />
      );
    default:
      return isGm ? (
        <PlayerTurnGm
          {...common}
          limitSec={view.limitSec}
          turnStartedLocalAt={view.turnStartedLocalAt}
          hints={room.gm?.state.hints ?? view.hints}
          shown={view.hints.length}
          photoUrl={gmPhotoUrl}
          players={others}
          submitted={view.submitted}
        />
      ) : (
        <PlayerTurn
          key={view.round}
          {...common}
          code={code}
          limitSec={view.limitSec}
          turnStartedLocalAt={view.turnStartedLocalAt}
          hints={view.hints}
          submitted={view.submitted.includes(me.pid)}
          submittedCount={others.filter((p) => view.submitted.includes(p.pid)).length}
          playerCount={others.length}
          onShutter={actions.shutter}
        />
      );
  }
}

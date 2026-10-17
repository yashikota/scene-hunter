import type { Room } from '../game/useRoom';
import { Final } from './Final';
import { ResultsPick, type ResultPhotoView } from './ResultsPick';
import { ResultsReveal } from './ResultsReveal';
import { ResultsWait } from './ResultsWait';

/** 中間結果（写真を見る・選ぶ・得点と順位）と最終結果の画面を、役割と段階で選ぶ。 */
export function ResultsScreen({ room, code }: { room: Room; code: string }) {
  const { view, actions, me, gmName } = room;
  const isGm = room.role === 'gm';
  const others = view.players.filter((p) => p.pid !== view.gmPid);
  const labelOf = (pid: string) => others.find((p) => p.pid === pid)?.label ?? '';
  const photos: ResultPhotoView[] | null =
    view.results?.photos.map((p) => ({ ...p, label: labelOf(p.pid) })) ?? null;
  const gmPhotoUrl = view.results?.gmPhotoUrl || undefined;

  switch (view.phase) {
    case 'picking':
      return isGm ? (
        <ResultsPick
          round={view.round}
          rounds={view.rounds}
          gmPhotoUrl={gmPhotoUrl}
          photos={photos}
          missing={others.filter((p) => !photos?.some((x) => x.pid === p.pid)).map((p) => p.label)}
          picks={room.gm?.state.picks ?? []}
          onToggle={actions.pickToggle}
          onConfirm={actions.confirmPicks}
        />
      ) : (
        <ResultsWait
          code={code}
          round={view.round}
          rounds={view.rounds}
          gmName={gmName}
          gmPhotoUrl={gmPhotoUrl}
          photos={photos}
          mePid={me.pid}
        />
      );
    case 'reveal':
      return (
        <ResultsReveal
          code={code}
          round={view.round}
          rounds={view.rounds}
          scores={view.ranking?.scores ?? []}
          totals={view.ranking?.totals ?? []}
          players={others}
          photoUrls={Object.fromEntries((view.results?.photos ?? []).map((p) => [p.pid, p.url]))}
          mePid={me.pid}
          isGm={isGm}
          onNext={actions.nextRound}
        />
      );
    default:
      return (
        <Final
          code={code}
          rounds={view.rounds}
          totals={view.final ?? []}
          players={others}
          mePid={me.pid}
          isGm={isGm}
          onBackToLobby={actions.backToLobby}
          onLeave={() => void actions.leave()}
        />
      );
  }
}

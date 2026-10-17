import { m } from '../paraglide/messages';
import { Screen } from '../ui/Screen';
import { formatCode, TopBar } from '../ui/TopBar';
import { Collecting, Thumb, TopicCard } from './ResultsParts';
import type { ResultPhotoView } from './ResultsPick';

export interface ResultsWaitProps {
  code: string;
  round: number;
  rounds: number;
  gmName: string;
  gmPhotoUrl?: string;
  /** まだ GM から届いていなければ null。 */
  photos: readonly ResultPhotoView[] | null;
  mePid: string;
}

/** 中間結果（プレイヤー）：写真を見ながら GM が選ぶのを待つ。撮影秒数は出さない。 */
export function ResultsWait({ code, round, rounds, gmName, gmPhotoUrl, photos, mePid }: ResultsWaitProps) {
  return (
    <Screen>
      <TopBar left={m.round_label({ round, rounds })} right={<span>{m.room_badge({ code: formatCode(code) })}</span>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 className="sh-display" style={{ fontSize: 22 }}>
          {m.results_wait_title()}
        </h1>
        <p className="sh-sub" style={{ margin: 0, fontSize: 13 }}>
          {m.results_wait_body({ name: gmName })}
        </p>
      </div>
      {photos === null ? (
        <Collecting text={m.results_collecting()} />
      ) : (
        <>
          <TopicCard url={gmPhotoUrl} />
          <ul
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}
          >
            {photos.map((p) => (
              <li
                key={p.pid}
                style={{
                  background: 'var(--color-surface)',
                  border: 'var(--border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Thumb url={p.url} alt={p.label} height={100} dim={!p.valid} />
                <span style={{ padding: 6, fontSize: 13, fontWeight: p.pid === mePid ? 800 : 500, overflowWrap: 'anywhere' }}>
                  {p.pid === mePid ? m.you_tag({ name: p.label }) : p.label}
                  {!p.valid && <span className="sh-sub"> {m.photo_invalid()}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div
        role="status"
        className="sh-card"
        style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 800, padding: '12px 16px' }}
      >
        <span className="sh-pulse" aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--color-accent)', border: 'var(--border)' }} />
        {m.results_wait_note()}
      </div>
    </Screen>
  );
}

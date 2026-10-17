import { m } from '../paraglide/messages';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { TopBar } from '../ui/TopBar';
import { Collecting, Thumb, TopicCard } from './ResultsParts';

export const MAX_PICKS = 3;

export interface ResultPhotoView {
  pid: string;
  label: string;
  url: string;
  valid: boolean;
}

export interface ResultsPickProps {
  round: number;
  rounds: number;
  gmPhotoUrl?: string;
  /** 写真の確認が終わるまでは null。 */
  photos: readonly ResultPhotoView[] | null;
  /** 出さなかった人の名前。 */
  missing: readonly string[];
  /** タップした順。 */
  picks: readonly string[];
  onToggle(pid: string): void;
  onConfirm(): void;
}

/** 決められる枚数：有効な写真が 3 枚に満たなければ、その枚数（0 枚でもよい）。 */
export const picksNeeded = (photos: readonly ResultPhotoView[]): number =>
  Math.min(MAX_PICKS, photos.filter((p) => p.valid).length);

/** 中間結果（GM）：お題に近い順に上位 3 枚を選ぶ。 */
export function ResultsPick({ round, rounds, gmPhotoUrl, photos, missing, picks, onToggle, onConfirm }: ResultsPickProps) {
  const need = photos ? picksNeeded(photos) : MAX_PICKS;
  const left = need - picks.length;
  return (
    <Screen>
      <TopBar left={m.round_label({ round, rounds })} right={<span className="sh-badge">{m.you_are_gm()}</span>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 className="sh-display" style={{ fontSize: 22 }}>
          {m.results_pick_title()}
        </h1>
        <p className="sh-sub" style={{ margin: 0, fontSize: 13 }}>
          {m.results_pick_hint()}
        </p>
      </div>
      <TopicCard url={gmPhotoUrl} />
      {photos === null ? (
        <Collecting text={m.results_checking()} />
      ) : (
        <ul
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}
        >
          {photos.map((p) => {
            const order = picks.indexOf(p.pid);
            const picked = order !== -1;
            return (
              <li key={p.pid} style={{ display: 'flex' }}>
                <button
                  type="button"
                  disabled={!p.valid}
                  aria-pressed={picked}
                  onClick={() => onToggle(p.pid)}
                  style={{
                    position: 'relative',
                    width: '100%',
                    padding: 0,
                    background: 'var(--color-surface)',
                    border: picked ? '3px solid var(--color-ink)' : 'var(--border)',
                    borderRadius: 12,
                    boxShadow: picked ? `3px 3px 0 ${order === 0 ? 'var(--color-accent)' : 'var(--color-timer)'}` : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    cursor: p.valid ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit',
                    color: 'var(--color-ink)',
                  }}
                >
                  <Thumb url={p.url} alt={p.label} height={100} dim={!p.valid} />
                  <span style={{ padding: 6, fontSize: 13, fontWeight: picked ? 800 : 500, overflowWrap: 'anywhere' }}>
                    {p.label}
                    {!p.valid && <span className="sh-sub"> {m.photo_invalid()}</span>}
                  </span>
                  {picked && (
                    <span
                      aria-label={m.rank_label({ rank: order + 1 })}
                      className="sh-display"
                      style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: order === 0 ? 'var(--color-accent)' : 'var(--color-timer)',
                        color: order === 0 ? 'var(--color-ink)' : '#fff',
                        border: 'var(--border)',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {order + 1}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {missing.map((name) => (
            <li
              key={name}
              className="sh-sub sh-pre"
              style={{
                border: '2px dashed var(--color-sub)',
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                fontSize: 12,
                padding: 6,
                overflowWrap: 'anywhere',
              }}
            >
              <b>{name}</b>
              {m.not_submitted()}
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button variant="primary" disabled={photos === null || left > 0} onClick={onConfirm}>
          {left > 0 ? m.pick_need_more({ count: left }) : m.pick_confirm()}
        </Button>
      </div>
    </Screen>
  );
}

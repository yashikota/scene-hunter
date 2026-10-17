import { m } from '../paraglide/messages';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { TopBar } from '../ui/TopBar';
import { useNow } from '../ui/useNow';
import { remainingSec } from './turnTime';

export interface PlayerSubmittedProps {
  round: number;
  rounds: number;
  startedAt: number | null;
  limitSec: number;
  /** 自分が撮った写真（この端末で撮ったときだけ）。 */
  photoUrl?: string;
  submitted: number;
  total: number;
}

/** 提出した後の待ち。撮影までの秒数は GM が選び終わるまで秘密なので、ここには出さない。 */
export function PlayerSubmitted({
  round,
  rounds,
  startedAt,
  limitSec,
  photoUrl,
  submitted,
  total,
}: PlayerSubmittedProps) {
  const now = useNow();
  return (
    <Screen>
      <TopBar
        left={m.round_label({ round, rounds })}
        right={
          <span className="sh-badge">
            {m.time_left({ count: remainingSec(startedAt, limitSec, now) })}
          </span>
        }
      />
      <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          className="sh-icon-tile"
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'var(--color-accent)',
            fontSize: 24,
          }}
        >
          ✓
        </span>
        <h1 className="sh-display" style={{ fontSize: 24 }}>
          {m.sent_title()}
        </h1>
      </div>
      <Card raised style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
        <div
          style={{
            aspectRatio: '4 / 3',
            borderRadius: 'var(--radius-sm)',
            border: 'var(--border)',
            background: 'var(--color-bg)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={m.your_photo()}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span className="sh-sub" style={{ fontSize: 13 }}>
              {m.your_photo()}
            </span>
          )}
        </div>
      </Card>
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
          <span>{m.everyone_submitted()}</span>
          <span>{m.people_ratio({ done: submitted, total })}</span>
        </div>
        <span
          className="sh-bar"
          role="progressbar"
          aria-label={m.everyone_submitted()}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={submitted}
        >
          <span
            className="sh-bar-fill"
            style={{ transform: `scaleX(${total > 0 ? submitted / total : 0})` }}
          />
        </span>
      </Card>
    </Screen>
  );
}

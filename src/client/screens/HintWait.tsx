import { m } from '../paraglide/messages';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { formatCode, TopBar } from '../ui/TopBar';

/** ヒントを作っている間の待ち（GM もプレイヤーも同じ）。 */
export function HintWait({ code, round, rounds }: { code: string; round: number; rounds: number }) {
  return (
    <Screen>
      <TopBar
        left={m.round_label({ round, rounds })}
        right={<span>{m.room_badge({ code: formatCode(code) })}</span>}
      />
      <div
        role="status"
        style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          textAlign: 'center',
        }}
      >
        <div aria-hidden="true" style={{ display: 'flex', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="sh-pulse"
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'var(--color-timer)',
                border: 'var(--border)',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
        <h1 className="sh-display sh-pre" style={{ fontSize: 24, lineHeight: 1.4 }}>
          {m.hint_wait_title()}
        </h1>
        <p className="sh-sub" style={{ margin: 0, fontSize: 14 }}>
          {m.hint_wait_body()}
        </p>
      </div>
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px', fontWeight: 800 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden="true"
            style={{ color: 'var(--color-timer)', fontFamily: 'var(--font-display), sans-serif' }}
          >
            ✓
          </span>
          <span>{m.step_photo_saved()}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden="true"
            className="sh-pulse"
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'var(--color-gold)',
              border: 'var(--border)',
            }}
          />
          <span style={{ flexGrow: 1 }}>{m.step_hints()}</span>
          <span className="sh-sub" style={{ fontSize: 13 }}>
            {m.step_working()}
          </span>
        </div>
      </Card>
    </Screen>
  );
}

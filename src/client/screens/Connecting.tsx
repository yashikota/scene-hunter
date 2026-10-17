import { m } from '../paraglide/messages';
import { Screen } from '../ui/Screen';

/** 部屋につなぐまでの待ち。preparing は、できたばかりの部屋がまだ見えない間（join の 404 を待ち直している間）。 */
export function Connecting({ preparing = false }: { preparing?: boolean }) {
  return (
    <Screen>
      <div
        role="status"
        style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          textAlign: 'center',
        }}
      >
        <div
          className="sh-icon-tile"
          style={{ width: 88, height: 88, background: 'var(--color-surface)', borderRadius: 22 }}
        >
          <span
            className="sh-pulse"
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--color-timer)',
              border: 'var(--border)',
            }}
          />
        </div>
        <h1 className="sh-display" style={{ fontSize: 24, lineHeight: 1.4 }}>
          {preparing ? m.preparing_title() : m.connecting_title()}
        </h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>
          {preparing ? m.preparing_body() : m.connecting_body()}
        </p>
      </div>
    </Screen>
  );
}

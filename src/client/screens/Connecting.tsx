import { m } from '../paraglide/messages';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';

export type WaitKind = 'connecting' | 'preparing' | 'claiming' | 'rejoining' | 'claimFailed';

const TEXT: Record<WaitKind, () => { title: string; body: string }> = {
  connecting: () => ({ title: m.connecting_title(), body: m.connecting_body() }),
  // できたばかりの部屋がまだ見えない間（join の 404 を待ち直している間）
  preparing: () => ({ title: m.preparing_title(), body: m.preparing_body() }),
  claiming: () => ({ title: m.claiming_title(), body: m.retrying_body() }),
  rejoining: () => ({ title: m.rejoining_title(), body: m.retrying_body() }),
  claimFailed: () => ({ title: m.claim_failed_title(), body: m.claim_failed_body() }),
};

/** 部屋につなぐまで、または GM の交代の途中の待ち。onLeave を渡すと「部屋を出る」を出す。 */
export function Connecting({
  kind,
  preparing = false,
  onLeave,
}: {
  kind?: WaitKind;
  preparing?: boolean;
  onLeave?: () => void;
}) {
  const k = kind ?? (preparing ? 'preparing' : 'connecting');
  const { title, body } = TEXT[k]();
  const failed = k === 'claimFailed';
  return (
    <Screen>
      <div
        role={failed ? 'alert' : 'status'}
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
            className={failed ? undefined : 'sh-pulse'}
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: failed ? 'var(--color-gold)' : 'var(--color-timer)',
              border: 'var(--border)',
            }}
          />
        </div>
        <h1 className="sh-display" style={{ fontSize: 24, lineHeight: 1.4 }}>
          {title}
        </h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>{body}</p>
      </div>
      {onLeave && (
        <Button variant="quiet" onClick={onLeave}>
          {m.leave_button()}
        </Button>
      )}
    </Screen>
  );
}

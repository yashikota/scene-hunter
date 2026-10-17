import { useState } from 'react';
import { m } from '../paraglide/messages';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { TopBar } from '../ui/TopBar';

export interface HintErrorProps {
  round: number;
  rounds: number;
  onRetry(): Promise<void>;
  onDissolve(): void;
}

/** ヒントの生成に 3 回失敗したとき（GM の画面）。お題の写真はそのまま使える。 */
export function HintError({ round, rounds, onRetry, onDissolve }: HintErrorProps) {
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <TopBar
        left={m.round_label({ round, rounds })}
        right={<span className="sh-badge">{m.gm_turn_badge()}</span>}
      />
      <div
        role="alert"
        style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          textAlign: 'center',
        }}
      >
        <div
          className="sh-icon-tile"
          aria-hidden="true"
          style={{ width: 88, height: 88, background: 'var(--color-gold)', borderRadius: 22 }}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l10 18H2z" />
            <path d="M12 10v5M12 18v.5" />
          </svg>
        </div>
        <h1 className="sh-display" style={{ fontSize: 22 }}>
          {m.hint_error_title()}
        </h1>
        <p className="sh-pre" style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
          {m.hint_error_body()}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button variant="primary" disabled={busy} onClick={() => void retry()}>
          {m.hint_retry()}
        </Button>
        <Button onClick={onDissolve}>{m.hint_dissolve()}</Button>
      </div>
      <p className="sh-sub" style={{ margin: 0, fontSize: 12, textAlign: 'center' }}>
        {m.hint_error_note()}
      </p>
    </Screen>
  );
}

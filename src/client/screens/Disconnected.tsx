import { m } from '../paraglide/messages';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { formatNumber } from '../ui/format';
import { Screen } from '../ui/Screen';
import { formatCode, TopBar } from '../ui/TopBar';
import { useNow } from '../ui/useNow';

export interface DisconnectedProps {
  code: string;
  round: number;
  rounds: number;
  gmName: string;
  /** 接続切れと判断した時刻（ミリ秒）。 */
  since: number;
  /** ここまでの自分の順位と点数（まだ無ければ null）。 */
  me: { rank: number | null; total: number } | null;
  onLeave(): void;
}

/** 経過時間を m:ss で。 */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** プレイヤーの画面：GM の接続が切れた。GM が戻ればそのまま続きから再開する。 */
export function Disconnected({ code, round, rounds, gmName, since, me, onLeave }: DisconnectedProps) {
  const now = useNow(1000);
  return (
    <Screen>
      <TopBar
        left={round > 0 ? m.round_label({ round, rounds }) : m.lobby_label()}
        right={<span>{m.room_badge({ code: formatCode(code) })}</span>}
      />
      <div
        role="alert"
        style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }}
      >
        <div className="sh-icon-tile" style={{ width: 88, height: 88, background: 'var(--color-gold)', borderRadius: 22 }}>
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0" />
            <path d="M3 3l18 18" />
          </svg>
        </div>
        <h1 className="sh-display sh-pre" style={{ fontSize: 24, lineHeight: 1.4 }}>
          {m.disconnected_title()}
        </h1>
        <p className="sh-pre" style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>
          {m.disconnected_body({ name: gmName })}
        </p>
        <div className="sh-chip" role="timer" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="sh-pulse" aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--color-timer)', border: 'var(--border)' }} />
          {m.disconnected_waiting({ time: formatElapsed(now - since) })}
        </div>
      </div>
      {me && (
        <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
          <span className="sh-sub" style={{ fontSize: 13, fontWeight: 800 }}>
            {m.disconnected_you()}
          </span>
          <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {me.rank === null ? m.points_value({ count: formatNumber(me.total) }) : m.rank_points({ rank: me.rank, points: formatNumber(me.total) })}
          </span>
        </Card>
      )}
      <Button variant="quiet" onClick={onLeave}>
        {m.leave_button()}
      </Button>
    </Screen>
  );
}

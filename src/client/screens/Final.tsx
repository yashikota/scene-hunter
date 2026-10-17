import type { Total } from '../../shared/protocol';
import { m } from '../paraglide/messages';
import { Button } from '../ui/Button';
import { formatNumber } from '../ui/format';
import { Screen } from '../ui/Screen';
import { formatCode, TopBar } from '../ui/TopBar';
import type { RevealPlayer } from './ResultsReveal';

export interface FinalProps {
  code: string;
  rounds: number;
  /** 合計の降順。 */
  totals: readonly Total[];
  players: readonly RevealPlayer[];
  mePid: string;
  isGm: boolean;
  onBackToLobby(): void;
  onLeave(): void;
}

// 表彰台は 2・1・3 の順に並べる。高さは 1 位が一番高い。
const PODIUM = [
  { index: 1, height: 96, bg: 'var(--color-surface)' },
  { index: 0, height: 128, bg: 'var(--color-gold)' },
  { index: 2, height: 72, bg: 'var(--color-surface)' },
] as const;

/** 最終結果：上位 3 人の表彰台と、それ以降の順位。 */
export function Final({
  code,
  rounds,
  totals,
  players,
  mePid,
  isGm,
  onBackToLobby,
  onLeave,
}: FinalProps) {
  const name = (pid: string) => {
    const p = players.find((x) => x.pid === pid);
    // 途中で出た人も、それまでの得点で順位に残る
    const label = p ? (p.left ? `${p.label} · ${m.status_left()}` : p.label) : '';
    return pid === mePid ? m.you_tag({ name: label }) : label;
  };
  const rest = totals.slice(3);
  return (
    <Screen>
      <TopBar
        left={m.rounds_done({ rounds })}
        right={<span>{m.room_badge({ code: formatCode(code) })}</span>}
      />
      <h1 className="sh-display" style={{ fontSize: 28, textAlign: 'center' }}>
        {m.final_title()}
      </h1>

      <ol
        aria-label={m.final_title()}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
          alignItems: 'end',
          margin: 0,
          padding: 0,
          listStyle: 'none',
        }}
      >
        {PODIUM.map(({ index, height, bg }) => {
          const t = totals[index];
          if (!t) return <li key={index} aria-hidden="true" />;
          return (
            <li
              key={t.pid}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                textAlign: 'center',
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 800, overflowWrap: 'anywhere' }}>
                {name(t.pid)}
              </span>
              <span
                className="sh-display"
                style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}
              >
                {formatNumber(t.total)}
              </span>
              <div
                className="sh-display"
                aria-label={m.rank_label({ rank: t.rank })}
                style={{
                  width: '100%',
                  height,
                  background: bg,
                  border: 'var(--border)',
                  borderRadius: '12px 12px 0 0',
                  boxShadow: 'var(--shadow)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  paddingTop: 8,
                  fontSize: 28,
                }}
              >
                {t.rank}
              </div>
            </li>
          );
        })}
      </ol>

      {rest.length > 0 && (
        <ol
          start={4}
          style={{
            display: 'grid',
            gridTemplateColumns: '28px minmax(0, 1fr) auto',
            gap: 8,
            margin: 0,
            padding: '12px 14px',
            listStyle: 'none',
            background: 'var(--color-surface)',
            border: 'var(--border)',
            borderRadius: 'var(--radius-lg)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {rest.map((t) => (
            <li
              key={t.pid}
              style={{ display: 'contents', fontWeight: t.pid === mePid ? 800 : 500 }}
            >
              <span style={{ fontWeight: 800 }}>{t.rank}</span>
              <span style={{ overflowWrap: 'anywhere' }}>{name(t.pid)}</span>
              <span>{formatNumber(t.total)}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="sh-actions">
        {isGm ? (
          <Button variant="primary" onClick={onBackToLobby}>
            {m.back_to_lobby()}
          </Button>
        ) : (
          <>
            <p
              className="sh-sub"
              role="status"
              style={{ margin: 0, fontSize: 14, textAlign: 'center' }}
            >
              {m.final_wait_note()}
            </p>
            <Button variant="quiet" onClick={onLeave}>
              {m.leave_button()}
            </Button>
          </>
        )}
      </div>
    </Screen>
  );
}

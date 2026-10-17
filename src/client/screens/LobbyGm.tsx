import { useRef, useState } from 'react';
import { m } from '../paraglide/messages';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { formatCode, TopBar } from '../ui/TopBar';

export interface LobbyMember {
  pid: string;
  label: string;
}

/** 参加者の一覧（GM を先頭に、2 列のタイル）。人数は GM を含める。 */
export function PlayerTiles({
  gmName,
  players,
  meId,
}: {
  gmName: string;
  players: readonly LobbyMember[];
  meId?: string;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 className="sh-display" style={{ fontSize: 17 }}>
          {m.players_heading()}
        </h2>
        <span className="sh-sub" style={{ fontSize: 13 }}>
          {m.players_count({ count: players.length + 1 })}
        </span>
      </div>
      <ul className="sh-tiles">
        <li className="sh-tile sh-tile--gm">{m.gm_tag({ name: gmName })}</li>
        {players.map((p) =>
          p.pid === meId ? (
            <li key={p.pid} className="sh-tile sh-tile--me">
              {m.you_tag({ name: p.label })}
            </li>
          ) : (
            <li key={p.pid} className="sh-tile">
              {p.label}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

export interface LobbyGmProps {
  code: string;
  gmName: string;
  players: readonly LobbyMember[];
  rounds: number;
  limitSec: number;
  onStart(): void;
  onTransfer(pid: string): Promise<void>;
  onDissolve(): void;
}

/** 共有するリンク。開くと番号が入ったトップになる。 */
export const shareLink = (code: string) => `${location.origin}/?code=${code}`;

export function LobbyGm({ code, gmName, players, rounds, limitSec, onStart, onTransfer, onDissolve }: LobbyGmProps) {
  const [choosing, setChoosing] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  const copyLink = () => {
    setCopied(false);
    const showManual = () => {
      // 許可されない、安全でないページで clipboard が無いなどでコピーできない。リンクを選んだ状態で見せて、手でコピーしてもらう
      setManual(true);
      setTimeout(() => linkRef.current?.select(), 0);
    };
    try {
      if (!navigator.clipboard) return showManual();
      navigator.clipboard.writeText(shareLink(code)).then(() => {
        setManual(false);
        setCopied(true);
      }, showManual);
    } catch {
      showManual();
    }
  };

  const transfer = async (pid: string) => {
    setTransferring(true);
    setFailed(false);
    try {
      await onTransfer(pid);
    } catch (e) {
      console.error('GM を交代できなかった', e);
      setFailed(true);
      setTransferring(false);
    }
  };

  const dissolve = () => {
    if (window.confirm(m.dissolve_confirm())) onDissolve();
  };

  return (
    <Screen>
      <TopBar left={m.lobby_label()} right={<span className="sh-badge">{m.you_are_gm()}</span>} />

      <Card raised style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span className="sh-sub" style={{ fontSize: 13, fontWeight: 800 }}>
          {m.code_label()}
        </span>
        <span className="sh-display" style={{ fontSize: 42, letterSpacing: '0.12em' }}>
          {formatCode(code)}
        </span>
        <span className="sh-sub" style={{ fontSize: 12, textAlign: 'center' }}>
          {m.share_code()}
        </span>
        <Button variant="quiet" onClick={copyLink} style={{ marginTop: 8 }}>
          {copied ? m.link_copied() : m.copy_link()}
        </Button>
        {manual && (
          <input
            ref={linkRef}
            readOnly
            className="sh-input"
            aria-label={m.copy_link()}
            value={shareLink(code)}
            onFocus={(e) => e.currentTarget.select()}
            style={{ fontSize: 13, textAlign: 'center' }}
          />
        )}
      </Card>

      <PlayerTiles gmName={gmName} players={players} />

      <Card style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{m.rounds_label()}</span>
          <span className="sh-display" style={{ fontSize: 20 }}>
            {rounds}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{m.limit_label()}</span>
          <span className="sh-display" style={{ fontSize: 20 }}>
            {m.seconds({ count: limitSec })}
          </span>
        </div>
      </Card>

      {failed && (
        <p role="alert" className="sh-error">
          {m.error_failed()}
        </p>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {players.length === 0 && (
          <p className="sh-sub" style={{ margin: 0, fontSize: 13, textAlign: 'center' }}>
            {m.start_waiting()}
          </p>
        )}
        <Button variant="primary" onClick={onStart} disabled={players.length === 0 || transferring}>
          {m.start_button()}
        </Button>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <Button
            variant="quiet"
            onClick={() => setChoosing(true)}
            disabled={players.length === 0 || transferring}
            aria-haspopup="dialog"
          >
            {m.transfer_button()}
          </Button>
          <Button variant="quiet" onClick={dissolve} disabled={transferring}>
            {m.dissolve_button()}
          </Button>
        </div>
      </div>

      {choosing && (
        <TransferSheet
          players={players}
          busy={transferring}
          onPick={transfer}
          onCancel={() => setChoosing(false)}
        />
      )}
    </Screen>
  );
}

/** GM を渡す相手を選ぶシート。 */
function TransferSheet({
  players,
  busy,
  onPick,
  onCancel,
}: {
  players: readonly LobbyMember[];
  busy: boolean;
  onPick(pid: string): void;
  onCancel(): void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgb(26 26 26 / 0.35)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}
    >
      <Card
        raised
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-title"
        style={{ width: '100%', maxWidth: 448, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h2 id="transfer-title" className="sh-display" style={{ fontSize: 17 }}>
          {m.transfer_title()}
        </h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {players.map((p) => (
            <li key={p.pid}>
              <Button variant="quiet" disabled={busy} onClick={() => onPick(p.pid)} style={{ width: '100%' }}>
                {p.label}
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="quiet" disabled={busy} onClick={onCancel} autoFocus>
          {m.cancel()}
        </Button>
      </Card>
    </div>
  );
}

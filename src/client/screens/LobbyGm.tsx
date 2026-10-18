import { useRef, useState } from "react";
import { activePlayers } from "../game/playerView";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { copyText, useCopied } from "../ui/copy";
import { RoomCode } from "../ui/RoomCode";
import { Sheet } from "../ui/Sheet";
import { TopBar } from "../ui/TopBar";
import { RulesButton } from "./Rules";

export interface LobbyMember {
  pid: string;
  label: string;
  /** 通信が切れたらしい人。薄く出し、人数には入れない。 */
  away?: boolean;
  /** 部屋を出た人。薄く出し、人数には入れない。 */
  left?: boolean;
}

/** 通信が切れたらしい人と出た人に添える「通信なし」「退出」。 */
export const AwayNote = ({ p }: { p: { away?: boolean; left?: boolean } }) =>
  p.left || p.away ? (
    <span className="sh-sub" style={{ fontSize: 12 }}>
      {" "}
      {p.left ? m.status_left() : m.status_away()}
    </span>
  ) : null;

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
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 className="sh-display" style={{ fontSize: 17 }}>
          {m.players_heading()}
        </h2>
        <span className="sh-sub" style={{ fontSize: 13 }}>
          {m.players_count({ count: activePlayers(players).length + 1 })}
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
            <li key={p.pid} className={`sh-tile ${p.away || p.left ? "sh-tile--away" : ""}`}>
              {p.label}
              <AwayNote p={p} />
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
export const shareLink = (code: string) => `${location.origin}/r/${code}`;

export function LobbyGm({
  code,
  gmName,
  players,
  rounds,
  limitSec,
  onStart,
  onTransfer,
  onDissolve,
}: LobbyGmProps) {
  const [choosing, setChoosing] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, flashCopied] = useCopied();
  const [manual, setManual] = useState(false);
  // 通信が切れたらしい人には GM を渡さない。始めるのにも、つながっている人が 1 人は要る。
  const active = activePlayers(players);
  const linkRef = useRef<HTMLInputElement>(null);

  const copyLink = async () => {
    if (await copyText(shareLink(code))) {
      setManual(false);
      flashCopied();
      return;
    }
    // 許可されない、安全でないページで clipboard が無いなどでコピーできない。リンクを選んだ状態で見せて、手でコピーしてもらう
    setManual(true);
    setTimeout(() => linkRef.current?.select(), 0);
  };

  const transfer = async (pid: string) => {
    setTransferring(true);
    setFailed(false);
    try {
      await onTransfer(pid);
    } catch (e) {
      console.error("GM を交代できなかった", e);
      setFailed(true);
      setTransferring(false);
    }
  };

  return (
    <Screen>
      <TopBar right={<span className="sh-badge">{m.you_are_gm()}</span>} />

      <Card
        raised
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
      >
        <span className="sh-sub" style={{ fontSize: 13, fontWeight: 800 }}>
          {m.code_label()}
        </span>
        <RoomCode code={code} />
        <Button variant="quiet" onClick={() => void copyLink()} style={{ marginTop: 8 }}>
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
            style={{ fontSize: 13, textAlign: "center" }}
          />
        )}
      </Card>

      <PlayerTiles gmName={gmName} players={players} />

      <p
        className="sh-sub"
        style={{ margin: 0, fontSize: 14, fontWeight: 800, textAlign: "center" }}
      >
        {m.rounds_chip({ count: rounds })} · {m.seconds({ count: limitSec })}
      </p>
      <RulesButton rounds={rounds} limitSec={limitSec} />

      {failed && (
        <p role="alert" className="sh-error">
          {m.error_failed()}
        </p>
      )}

      <div className="sh-actions">
        <p className="sh-sub" style={{ margin: 0, fontSize: 13, textAlign: "center" }}>
          {/* 参加者がそろったら、ゲーム中に GM の画面を閉じないよう先に伝える */}
          {active.length === 0 ? m.start_waiting() : m.keep_screen_on()}
        </p>
        <Button variant="primary" onClick={onStart} disabled={active.length === 0 || transferring}>
          {m.start_button()}
        </Button>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <Button
            variant="quiet"
            onClick={() => setChoosing(true)}
            disabled={active.length === 0 || transferring}
            aria-haspopup="dialog"
          >
            {m.transfer_button()}
          </Button>
          <Button
            variant="quiet"
            onClick={() => setConfirming(true)}
            disabled={transferring}
            aria-haspopup="dialog"
          >
            {m.dissolve_button()}
          </Button>
        </div>
      </div>

      {confirming && (
        <Sheet title={m.dissolve_confirm()} onCancel={() => setConfirming(false)}>
          <div className="sh-row sh-row--even">
            <Button variant="quiet" onClick={() => setConfirming(false)} autoFocus>
              {m.cancel()}
            </Button>
            <Button variant="primary" onClick={onDissolve}>
              {m.dissolve_button()}
            </Button>
          </div>
        </Sheet>
      )}
      {choosing && (
        <TransferSheet
          players={active}
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
    <Sheet title={m.transfer_title()} busy={busy} onCancel={onCancel}>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {players.map((p) => (
          <li key={p.pid}>
            <Button
              variant="quiet"
              disabled={busy}
              onClick={() => onPick(p.pid)}
              style={{ width: "100%" }}
            >
              {p.label}
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="quiet" disabled={busy} onClick={onCancel} autoFocus>
        {m.cancel()}
      </Button>
    </Sheet>
  );
}

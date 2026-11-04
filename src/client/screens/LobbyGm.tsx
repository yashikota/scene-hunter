import { AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import * as mo from "motion/react-m";
import { useRef, useState } from "react";
import { MIN_PLAYERS } from "../game/gmMachine";
import { activePlayers } from "../game/playerView";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Screen } from "../ui/Screen";
import { copyText, useCopied } from "../ui/copy";
import { Icon, ICON } from "../ui/Icon";
import { RoomCode } from "../ui/RoomCode";
import { ConfirmSheet, Sheet } from "../ui/Sheet";
import { TopBar } from "../ui/TopBar";
import { EditableName } from "./Rename";
import { RoleSwitch } from "./RoleSwitch";
import { RulesButton } from "./Rules";

export interface LobbyMember {
  pid: string;
  label: string;
  /** 通信が切れたらしい人。薄く出し、人数には入れない。 */
  away?: boolean;
  /** 部屋を出た人。薄く出し、人数には入れない。 */
  left?: boolean;
}

/** 参加者の札は、はずみながら出す。 */
const TILE_IN = {
  initial: { opacity: 0, scale: 0.5 },
  animate: { opacity: 1, scale: 1 },
  transition: { type: "spring", stiffness: 500, damping: 20 },
} as const;
/** 通信が切れたらしい人と出た人に添える「通信なし」「退出」。 */
export const AwayNote = ({ p }: { p: { away?: boolean; left?: boolean } }) =>
  p.left || p.away ? (
    <span className="sh-sub" style={{ fontSize: 12 }}>
      {m.status_note({ status: p.left ? m.status_left() : m.status_away() })}
    </span>
  ) : null;

/** 参加者の一覧（GM を先頭に、2 列のタイル）。人数は GM を含める。 */
export function PlayerTiles({
  gmName,
  players,
  hostRole = "gm",
  meId,
  self,
}: {
  gmName: string;
  hostRole?: "gm" | "admin";
  players: readonly LobbyMember[];
  /** プレイヤーとして見ているときの自分の pid。 */
  meId?: string;
  /** 自分の札で名前を変えられるようにする。name は自分で付けた名前（GM なら GM の札が自分）。 */
  self?: { name: string; onRename(name: string): Promise<void> };
}) {
  const own = (display: string) =>
    self ? <EditableName display={display} name={self.name} onRename={self.onRename} /> : display;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 className="sh-display" style={{ fontSize: 17 }}>
          {m.players_heading()}
        </h2>
        <span className="sh-sub" style={{ fontSize: 13 }} aria-live="polite">
          {m.players_count({ count: activePlayers(players).length + (hostRole === "gm" ? 1 : 0) })}
        </span>
      </div>
      <ul className="sh-tiles">
        {hostRole === "gm" && (
          <mo.li className="sh-tile sh-tile--gm" layout {...TILE_IN}>
            {meId === undefined ? own(m.gm_tag({ name: gmName })) : m.gm_tag({ name: gmName })}
          </mo.li>
        )}
        <AnimatePresence mode="popLayout">
          {players.map((p) => (
            <mo.li
              key={p.pid}
              layout
              {...TILE_IN}
              exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.2 } }}
              className={`sh-tile ${p.pid === meId ? "sh-tile--me" : p.away || p.left ? "sh-tile--away" : ""}`}
            >
              {p.pid === meId ? (
                own(m.you_tag({ name: p.label }))
              ) : (
                <>
                  {p.label}
                  <AwayNote p={p} />
                </>
              )}
            </mo.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

export interface LobbyGmProps {
  role?: "gm" | "admin";
  onSwitchRole?(role: "gm" | "admin"): Promise<void>;
  code: string;
  gmName: string;
  players: readonly LobbyMember[];
  rounds: number;
  limitSec: number;
  onStart(): void;
  onTransfer(pid: string, retainAdmin?: boolean): Promise<void>;
  onDissolve(): void;
  /** 自分（GM）の名前を変える。 */
  onRename(name: string): Promise<void>;
}

/** 共有するリンク。開くと番号が入ったトップになる。 */
export const shareLink = (code: string) => `${location.origin}/r/${code}`;

export function LobbyGm({
  role = "gm",
  onSwitchRole,
  code,
  gmName,
  players,
  rounds,
  limitSec,
  onStart,
  onTransfer,
  onDissolve,
  onRename,
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

  const transfer = async (pid: string, retainAdmin: boolean) => {
    setTransferring(true);
    setFailed(false);
    try {
      await onTransfer(pid, retainAdmin);
    } catch (e) {
      console.error("GM を交代できなかった", e);
      setFailed(true);
      setTransferring(false);
    }
  };

  return (
    <Screen title={m.room_badge({ code })}>
      <TopBar
        right={
          <span className="sh-badge">{role === "admin" ? m.admin_title() : m.you_are_gm()}</span>
        }
      />

      <Card
        raised
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
      >
        <span className="sh-sub" style={{ fontSize: 13, fontWeight: 800 }}>
          {m.code_label()}
        </span>
        <div className="sh-code-row">
          <RoomCode code={code} />
          <button
            type="button"
            className="sh-icon-btn"
            onClick={() => void copyLink()}
            aria-label={copied ? m.link_copied() : m.copy_link()}
          >
            <Icon d={copied ? ICON.check : ICON.copy} size={22} />
          </button>
        </div>
        <span className="sh-sr-only" aria-live="polite">
          {copied ? m.link_copied() : ""}
        </span>
        <a href={shareLink(code)} aria-label={m.room_badge({ code })}>
          <QRCodeSVG
            value={shareLink(code)}
            size={192}
            level="M"
            marginSize={4}
            title={m.room_badge({ code })}
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
          />
        </a>
        <p className="sh-sub" style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 800 }}>
          {m.rounds_chip({ count: rounds })} · {m.seconds({ count: limitSec })}
        </p>
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

      {onSwitchRole && <RoleSwitch role={role} onSwitch={onSwitchRole} disabled={transferring} />}
      <PlayerTiles
        gmName={gmName}
        hostRole={role}
        players={players}
        self={{ name: gmName, onRename }}
      />

      <RulesButton rounds={rounds} limitSec={limitSec} />

      {failed && !choosing && (
        <p role="alert" className="sh-error">
          {m.error_failed()}
        </p>
      )}

      <div className="sh-actions">
        <p className="sh-sub" style={{ margin: 0, fontSize: 13, textAlign: "center" }}>
          {/* 始められる人数（GM を入れて 3 人）までの残りを出し、そろったら、ゲーム中に GM の画面を閉じないよう先に伝える */}
          {role === "admin"
            ? m.host_choose_gm()
            : active.length < MIN_PLAYERS
              ? m.start_need_players({ count: MIN_PLAYERS - active.length })
              : m.keep_screen_on()}
        </p>
        <Button
          variant="primary"
          onClick={onStart}
          disabled={role === "admin" || active.length < MIN_PLAYERS || transferring}
        >
          {m.start_button()}
        </Button>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <Button
            variant="quiet"
            onClick={() => {
              setFailed(false);
              setChoosing(true);
            }}
            disabled={active.length === 0 || transferring}
            aria-haspopup="dialog"
          >
            {role === "admin" ? m.host_assign_gm() : m.transfer_button()}
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

      <ConfirmSheet
        open={confirming}
        title={m.dissolve_confirm()}
        confirmLabel={m.dissolve_button()}
        onConfirm={onDissolve}
        onCancel={() => setConfirming(false)}
      />
      {choosing && (
        <TransferSheet
          open={choosing}
          players={active}
          busy={transferring}
          failed={failed}
          onPick={(pid) => void transfer(pid, role === "admin")}
          onCancel={() => {
            setChoosing(false);
            setFailed(false);
          }}
        />
      )}
    </Screen>
  );
}

/** 相手と交代後の自分の役割を選び、確定してから GM を渡す。 */
function TransferSheet({
  open,
  players,
  busy,
  failed,
  onPick,
  onCancel,
}: {
  open: boolean;
  players: readonly LobbyMember[];
  busy: boolean;
  failed: boolean;
  onPick(pid: string): void;
  onCancel(): void;
}) {
  const [pid, setPid] = useState("");
  const selected = players.find((p) => p.pid === pid);
  const fieldStyle = { border: 0, padding: 0, margin: 0, display: "grid", gap: 8 };
  return (
    <Sheet open={open} title={m.transfer_title()} busy={busy} onCancel={onCancel}>
      <p className="sh-sub" style={{ margin: 0 }}>
        {m.transfer_gm_help()}
      </p>
      <fieldset disabled={busy} style={fieldStyle}>
        <legend>{m.transfer_target()}</legend>
        {players.map((p) => (
          <label
            className="sh-card"
            key={p.pid}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}
          >
            <input
              type="radio"
              name="next-gm"
              value={p.pid}
              checked={pid === p.pid}
              onChange={() => setPid(p.pid)}
            />
            {p.label}
          </label>
        ))}
      </fieldset>
      {failed && (
        <p role="alert" className="sh-error">
          {m.error_failed()}
        </p>
      )}
      <Button
        variant="primary"
        disabled={busy || !selected}
        onClick={() => selected && onPick(selected.pid)}
      >
        {selected ? m.transfer_confirm({ name: selected.label }) : m.transfer_select_hint()}
      </Button>
      <Button variant="quiet" disabled={busy} onClick={onCancel}>
        {m.cancel()}
      </Button>
    </Sheet>
  );
}

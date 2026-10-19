import type { ReactNode } from "react";
import { m } from "../paraglide/messages";
import { copyText, useCopied } from "./copy";

/**
 * 部屋の番号を押すと、番号（6 桁の数字）をコピーするボタン。コピーできたら、しばらく
 * children の代わりに「コピーしました」を出す。番号は画面に見えているので、コピーできないときは何もしない。
 */
function CopyCode({
  code,
  className,
  children,
}: {
  code: string;
  className: string;
  children: ReactNode;
}) {
  const [copied, flash] = useCopied();
  const copy = async () => {
    if (await copyText(code)) flash();
  };
  return (
    <button
      type="button"
      className={className}
      onClick={() => void copy()}
      aria-label={m.copy_code({ code: code })}
    >
      <span aria-live="polite">{copied ? m.code_copied() : children}</span>
    </button>
  );
}

/** 画面の上端に置く小さな番号（「部屋 482913」）。 */
export function RoomBadge({ code }: { code: string }) {
  return (
    <CopyCode code={code} className="sh-badge sh-copy">
      {m.room_badge({ code: code })}
    </CopyCode>
  );
}

/** ロビーや名前の入力に大きく出す番号。 */
export function RoomCode({ code }: { code: string }) {
  return (
    <CopyCode code={code} className="sh-display sh-code sh-copy">
      {code}
    </CopyCode>
  );
}

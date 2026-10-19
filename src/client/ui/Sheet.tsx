import { AnimatePresence } from "motion/react";
import * as mo from "motion/react-m";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { SMOOTH, SPRING } from "./motion";

/**
 * 画面の下から出す確かめや選択のシート。外側を押すと閉じる（busy のあいだは閉じない）。
 * ブラウザの confirm() は見た目が画面と揃わないので、こちらを使う。
 * open を false にすると、下へ引っ込めてから消す。
 * center は画面の真ん中に出す確かめ（解散のように、操作を止めて答えてほしいもの）。
 */
export function Sheet({
  open,
  center = false,
  title,
  busy = false,
  onCancel,
  children,
}: {
  open: boolean;
  center?: boolean;
  title: string;
  busy?: boolean;
  onCancel(): void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useModal(open, dialog, () => !busy && onCancel());
  const hidden = center ? { scale: 0.7, opacity: 0 } : { y: "110%" };
  const shown = center ? { scale: 1, opacity: 1 } : { y: 0 };
  // body の直下に出し、後ろの画面をまとめて inert にできるようにする
  return createPortal(
    <AnimatePresence>
      {open && (
        <mo.div
          key="sheet"
          className={`sh-sheet-backdrop ${center ? "sh-sheet-backdrop--center" : ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
          onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}
        >
          <mo.div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="sh-card sh-card--raised sh-sheet"
            initial={hidden}
            animate={shown}
            exit={hidden}
            transition={center ? SPRING : SMOOTH}
          >
            <h2 id={titleId} className="sh-display" style={{ fontSize: 17 }}>
              {title}
            </h2>
            {children}
          </mo.div>
        </mo.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * 開いているあいだ、ダイアログの外を操作できなくする（inert）。
 * 開いたらダイアログの中へフォーカスを移し（autoFocus の部品があればそれ、無ければダイアログ自身）、
 * Esc で閉じ、閉じたら開く前にフォーカスのあった部品（開いたボタン）へ戻す。
 */
function useModal(open: boolean, dialog: RefObject<HTMLElement | null>, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  // 開いた瞬間のフォーカスを、描画の時点で覚える。effect の時点では、中の autoFocus へもう移っている
  const wasOpen = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  if (open !== wasOpen.current) {
    wasOpen.current = open;
    if (open) openerRef.current = document.activeElement as HTMLElement | null;
  }
  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    const box = dialog.current;
    const others = Array.from(document.body.children).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement && !el.contains(box) && !el.inert && el.tagName !== "SCRIPT",
    );
    for (const el of others) el.inert = true;
    if (box && !box.contains(document.activeElement)) box.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      for (const el of others) el.inert = false;
      if (opener?.isConnected) opener.focus();
    };
  }, [open, dialog]);
}

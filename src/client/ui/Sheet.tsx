import { AnimatePresence } from "motion/react";
import * as mo from "motion/react-m";
import { useId, type ReactNode } from "react";
import { SMOOTH } from "./motion";

/**
 * 画面の下から出す確かめや選択のシート。外側を押すと閉じる（busy のあいだは閉じない）。
 * ブラウザの confirm() は見た目が画面と揃わないので、こちらを使う。
 * open を false にすると、下へ引っ込めてから消す。
 */
export function Sheet({
  open,
  title,
  busy = false,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  busy?: boolean;
  onCancel(): void;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <AnimatePresence>
      {open && (
        <mo.div
          key="sheet"
          className="sh-sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
          onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}
          onKeyDown={(e) => e.key === "Escape" && !busy && onCancel()}
        >
          <mo.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="sh-card sh-card--raised sh-sheet"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            exit={{ y: "110%" }}
            transition={SMOOTH}
          >
            <h2 id={titleId} className="sh-display" style={{ fontSize: 17 }}>
              {title}
            </h2>
            {children}
          </mo.div>
        </mo.div>
      )}
    </AnimatePresence>
  );
}

import { useId, type ReactNode } from "react";
import { Card } from "./Card";

/**
 * 画面の下から出す確かめや選択のシート。外側を押すと閉じる（busy のあいだは閉じない）。
 * ブラウザの confirm() は見た目が画面と揃わないので、こちらを使う。
 */
export function Sheet({
  title,
  busy = false,
  onCancel,
  children,
}: {
  title: string;
  busy?: boolean;
  onCancel(): void;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <div
      className="sh-sheet-backdrop"
      onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}
      onKeyDown={(e) => e.key === "Escape" && !busy && onCancel()}
    >
      <Card raised role="dialog" aria-modal="true" aria-labelledby={titleId} className="sh-sheet">
        <h2 id={titleId} className="sh-display" style={{ fontSize: 17 }}>
          {title}
        </h2>
        {children}
      </Card>
    </div>
  );
}

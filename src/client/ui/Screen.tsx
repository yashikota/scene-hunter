import { useEffect, useRef, type HTMLAttributes } from "react";

/**
 * 1 画面の外枠。スマートフォンの幅に合わせ、広い画面では中央に寄せる。
 * title を渡すと、見えない h1 を置く（画面に見出しになる文字が無いときに、スクリーンリーダーへ画面の名前を伝える）。
 * ゲームは操作しなくても画面が進むので、前の画面と一緒にフォーカスが消えていたら、新しい画面の h1 へ移して読み上げさせる。
 */
export function Screen({
  variant = "room",
  className,
  title,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { variant?: "top" | "room"; title?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const h1 = ref.current?.querySelector<HTMLElement>("h1");
    if (!h1) return;
    h1.tabIndex = -1;
    h1.focus({ preventScroll: true });
  }, []);
  return (
    <main
      ref={ref}
      className={`sh-screen ${variant === "top" ? "sh-screen--top" : ""} ${className ?? ""}`}
      {...rest}
    >
      {title !== undefined && <h1 className="sh-sr-only">{title}</h1>}
      {children}
    </main>
  );
}

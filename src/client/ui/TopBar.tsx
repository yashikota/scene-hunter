import type { ReactNode } from "react";
import { m } from "../paraglide/messages";

/** 画面の上端：左に画面の名前（「ROUND 2 / 3」など。無ければアプリのロゴ）、右に部屋の番号や印。 */
export function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="sh-topbar">
      {left === undefined ? (
        <span className="sh-topbar-brand">
          <img src="/camera.webp" alt="" width={22} height={22} />
          <span className="sh-brand">{m.app_name()}</span>
        </span>
      ) : (
        <span>{left}</span>
      )}
      {right}
    </header>
  );
}

/** 部屋の番号を 3 桁ずつに分けて読みやすくする（482913 → 482 913）。 */
export const formatCode = (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`;

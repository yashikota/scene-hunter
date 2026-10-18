import type { ReactNode } from "react";

/** 画面の上端：左に画面の名前（「ロビー」など）、右に部屋の番号や印。 */
export function TopBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <header className="sh-topbar">
      <span>{left}</span>
      {right}
    </header>
  );
}

/** 部屋の番号を 3 桁ずつに分けて読みやすくする（482913 → 482 913）。 */
export const formatCode = (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`;

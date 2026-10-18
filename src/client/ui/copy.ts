import { useEffect, useRef, useState } from "react";

/** 「コピーしました」を出しておく長さ。過ぎたら元の表示に戻す。 */
export const COPIED_MS = 2000;

/** クリップボードに書く。使えない（許可されない、安全でないページなど）ときは false。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** コピーしたことを COPIED_MS のあいだだけ true にする。続けて押したら、そこから数え直す。 */
export function useCopied(): [copied: boolean, flash: () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = () => {
    clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };
  return [copied, flash];
}

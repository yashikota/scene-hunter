/** 線で描くアイコンの形（24 × 24）。 */
export const ICON = {
  pencil: "M4 20h4L19 9l-4-4L4 16v4M13.5 6.5l4 4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  cross: "M6 6l12 12M18 6L6 18",
  /** 2 枚重ねの紙。 */
  copy: "M9 9h10v11H9zM5 15V4h10",
} as const;

/** ボタンの中に置く線のアイコン。読み上げはボタンの aria-label に任せる。 */
export function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

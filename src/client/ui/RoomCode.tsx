import { m } from "../paraglide/messages";

/** 画面の上端に置く小さな番号（「部屋 482913」）。 */
export function RoomBadge({ code }: { code: string }) {
  return <span className="sh-badge">{m.room_badge({ code: code })}</span>;
}

/** ロビーや名前の入力に大きく出す番号。 */
export function RoomCode({ code }: { code: string }) {
  return <span className="sh-display sh-code">{code}</span>;
}

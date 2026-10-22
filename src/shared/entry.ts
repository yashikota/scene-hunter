// 部屋に入るときの決まり（部屋の番号と名前）。画面と Worker の両方で同じものを使う。

/** 部屋の番号は 6 桁の数字。 */
export const ROOM_CODE_RE = /^\d{6}$/;

export const NAME_MAX = 12;

/**
 * 制御文字と、見えない書式文字（ゼロ幅の空白、文字の向きを変える記号など）。名前で別の人や GM を装えないよう取り除く。
 * 絵文字をつなぐ ZWJ（U+200D）は残す。
 */
const INVISIBLE = /(?!‍)[\p{Cc}\p{Cf}]/gu;

/** 名前から見えない文字と前後の空白を除き、1〜NAME_MAX 文字にそろえる。合わなければ null。 */
export function cleanName(raw: string): string | null {
  const name = raw.normalize("NFC").replace(INVISIBLE, "").trim();
  const len = [...name].length;
  return len < 1 || len > NAME_MAX ? null : name;
}

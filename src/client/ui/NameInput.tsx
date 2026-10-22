import type { InputHTMLAttributes } from "react";
import { NAME_MAX } from "../../shared/entry";
import { m } from "../paraglide/messages";

/**
 * 自分の名前の欄（読み上げ用のラベルつき）。部屋に入るときと、ロビーで名前を変えるときに使う。
 * error があれば、その要素（id）を説明として結びつけ、欄を不正の状態にする。
 */
export function NameInput({
  id,
  errorId,
  onValue,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  id: string;
  /** 出しているエラーの要素の id。エラーが無ければ null。 */
  errorId: string | null;
  onValue(value: string): void;
}) {
  return (
    <>
      <label htmlFor={id} className="sh-sr-only">
        {m.name_label()}
      </label>
      <input
        id={id}
        className={`sh-input ${className ?? ""}`}
        // 名前の欄だけのフォームは、パスワードマネージャーにログインの欄と見なされやすい。保存も補完も止める
        name="sh-player-name"
        autoComplete="off"
        data-1p-ignore=""
        data-lpignore="true"
        data-bwignore=""
        data-form-type="other"
        autoFocus
        maxLength={NAME_MAX}
        placeholder={m.name_label()}
        aria-invalid={errorId !== null}
        aria-describedby={errorId ?? undefined}
        onChange={(e) => onValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        {...rest}
      />
    </>
  );
}

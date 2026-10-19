import { useId, useState, type FormEvent } from "react";
import { m } from "../paraglide/messages";
import { cleanName, errorMessage, NAME_MAX } from "./entryErrors";

const PENCIL = "M4 20h4L19 9l-4-4L4 16v4M13.5 6.5l4 4";
const CHECK = "M5 12.5l4.5 4.5L19 7.5";
const CROSS = "M6 6l12 12M18 6L6 18";

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * ロビーの自分の札の中身。名前の横の鉛筆を押すと、その場で名前を入れ直せる。
 * Enter か ✓ で決め、Esc か × でやめる。
 */
export function EditableName({
  display,
  name,
  onRename,
}: {
  /** ふだん出す文字（「はるか（あなた）」など）。 */
  display: string;
  /** 自分で付けた名前。入れ直すときの初めの値。 */
  name: string;
  onRename(name: string): Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <span className="sh-name-view">
        <span className="sh-name-text">{display}</span>
        <button
          type="button"
          className="sh-icon-btn"
          aria-label={m.rename_button()}
          onClick={() => setEditing(true)}
        >
          <Icon d={PENCIL} />
        </button>
      </span>
    );
  }
  return <NameEditor name={name} onRename={onRename} onDone={() => setEditing(false)} />;
}

function NameEditor({
  name: initial,
  onRename,
  onDone,
}: {
  name: string;
  onRename(name: string): Promise<void>;
  onDone(): void;
}) {
  const id = useId();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const n = cleanName(name);
    if (!n) return setError(m.error_name());
    // 同じ名前なら、参加証を取り直さずに閉じる
    if (n === initial) return onDone();
    setError(null);
    setBusy(true);
    try {
      await onRename(n);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form
      className="sh-name-edit"
      onSubmit={submit}
      noValidate
      onKeyDown={(e) => e.key === "Escape" && !busy && onDone()}
    >
      <div className="sh-name-edit-row">
        <label htmlFor={`${id}-name`} className="sh-sr-only">
          {m.name_label()}
        </label>
        <input
          id={`${id}-name`}
          className="sh-input sh-input--inline"
          // 名前の欄だけのフォームは、パスワードマネージャーにログインの欄と見なされやすい。保存も補完も止める
          name="sh-player-name"
          autoComplete="off"
          data-1p-ignore=""
          data-lpignore="true"
          data-bwignore=""
          data-form-type="other"
          enterKeyHint="done"
          autoFocus
          maxLength={NAME_MAX}
          placeholder={m.name_label()}
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="submit"
          className="sh-icon-btn sh-icon-btn--ok"
          aria-label={m.rename_save()}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? <span className="sh-spinner" aria-hidden="true" /> : <Icon d={CHECK} />}
        </button>
        <button
          type="button"
          className="sh-icon-btn"
          aria-label={m.cancel()}
          disabled={busy}
          onClick={onDone}
        >
          <Icon d={CROSS} />
        </button>
      </div>
      {error && (
        <p role="alert" className="sh-error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  );
}

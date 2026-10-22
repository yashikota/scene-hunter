import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { m } from "../paraglide/messages";
import { cleanName } from "../../shared/entry";
import { Icon, ICON } from "../ui/Icon";
import { NameInput } from "../ui/NameInput";
import { errorMessage } from "./entryErrors";

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
  const pencil = useRef<HTMLButtonElement>(null);
  const closed = useRef(false);
  // 書き換えを終えたら、消えた入力欄の代わりに鉛筆へフォーカスを戻す
  useEffect(() => {
    if (!editing && closed.current) pencil.current?.focus();
  }, [editing]);
  if (!editing) {
    return (
      <span className="sh-name-view">
        <span className="sh-name-text">{display}</span>
        <button
          ref={pencil}
          type="button"
          className="sh-icon-btn"
          aria-label={m.rename_button()}
          onClick={() => setEditing(true)}
        >
          <Icon d={ICON.pencil} />
        </button>
      </span>
    );
  }
  const done = () => {
    closed.current = true;
    setEditing(false);
  };
  return <NameEditor name={name} onRename={onRename} onDone={done} />;
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
        <NameInput
          id={`${id}-name`}
          className="sh-input--inline"
          errorId={error ? `${id}-error` : null}
          enterKeyHint="done"
          value={name}
          disabled={busy}
          onValue={setName}
        />
        <button
          type="submit"
          className="sh-icon-btn sh-icon-btn--ok"
          aria-label={m.rename_save()}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? <span className="sh-spinner" aria-hidden="true" /> : <Icon d={ICON.check} />}
        </button>
        <button
          type="button"
          className="sh-icon-btn"
          aria-label={m.cancel()}
          disabled={busy}
          onClick={onDone}
        >
          <Icon d={ICON.cross} />
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="sh-error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  );
}

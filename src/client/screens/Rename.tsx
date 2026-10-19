import { useId, useState, type FormEvent } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { cleanName, errorMessage, NAME_MAX } from "./entryErrors";

/** ロビーに置く「名前を変える」のボタン。押すと、名前を入れ直すシートを出す。 */
export function RenameButton({
  name,
  onRename,
}: {
  /** いまの自分の名前。 */
  name: string;
  onRename(name: string): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="quiet" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {m.rename_button()}
      </Button>
      <Sheet open={open} title={m.rename_title()} busy={busy} onCancel={() => setOpen(false)}>
        <RenameForm
          name={name}
          busy={busy}
          onCancel={() => setOpen(false)}
          onSubmit={async (n) => {
            setBusy(true);
            try {
              await onRename(n);
              setOpen(false);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>
    </>
  );
}

function RenameForm({
  name: initial,
  busy,
  onCancel,
  onSubmit,
}: {
  name: string;
  busy: boolean;
  onCancel(): void;
  onSubmit(name: string): Promise<void>;
}) {
  const id = useId();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const n = cleanName(name);
    if (!n) return setError(m.error_name());
    // 同じ名前なら、参加証を取り直さずに閉じる
    if (n === initial) return onCancel();
    setError(null);
    try {
      await onSubmit(n);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} noValidate className="sh-stack">
      <label htmlFor={`${id}-name`} className="sh-sr-only">
        {m.name_label()}
      </label>
      <input
        id={`${id}-name`}
        className="sh-input sh-input--big"
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
      {error && (
        <p role="alert" className="sh-error">
          {error}
        </p>
      )}
      <div className="sh-row sh-row--even">
        <Button variant="quiet" onClick={onCancel} disabled={busy}>
          {m.cancel()}
        </Button>
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
          {busy && <span className="sh-spinner" aria-hidden="true" />}
          {m.rename_save()}
        </Button>
      </div>
    </form>
  );
}

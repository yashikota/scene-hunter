import { useId, useRef, useState, type FormEvent } from "react";
import { loadLastName, saveLastName } from "../game/membership";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Screen } from "../ui/Screen";
import { RoomCode } from "../ui/RoomCode";
import { Connecting } from "./Connecting";
import { cleanName } from "../../shared/entry";
import { NameInput } from "../ui/NameInput";
import { errorMessage } from "./entryErrors";

export interface NameStepProps {
  /** 入る部屋の番号。部屋を作るときは無し。 */
  code?: string;
  /** 決めた名前で部屋に入る（作る）。部屋がまだ見えない間は onWaiting を呼ぶ。失敗は reject する。 */
  onSubmit(name: string, opts: { onWaiting(): void }): Promise<void>;
  onBack(): void;
}

/**
 * 部屋を選んだ後に、名前だけを聞く。前に使った名前を入れておく。
 * 入力欄とボタンは画面の上寄せ（スマートフォンのキーボードで隠れないように）。
 */
export function NameStep({ code, onSubmit, onBack }: NameStepProps) {
  const id = useId();
  const [name, setName] = useState(loadLastName);
  const [status, setStatus] = useState<"idle" | "busy" | "preparing">("idle");
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (running.current) return;
    const n = cleanName(name);
    if (!n) return setError(m.error_name());
    running.current = true;
    saveLastName(n);
    setError(null);
    setStatus("busy");
    try {
      await onSubmit(n, { onWaiting: () => setStatus("preparing") });
    } catch (err) {
      setStatus("idle");
      setError(errorMessage(err));
    } finally {
      running.current = false;
    }
  };

  if (status === "preparing") return <Connecting preparing />;
  const busy = status === "busy";

  return (
    <Screen variant="top" title={code ? m.join_button() : undefined}>
      <form onSubmit={submit} noValidate className="sh-stack">
        {code ? (
          <RoomCode code={code} />
        ) : (
          <h1 className="sh-display" style={{ fontSize: 28, textAlign: "center", margin: 0 }}>
            {m.create_button()}
          </h1>
        )}
        <NameInput
          id={`${id}-name`}
          className="sh-input--big"
          errorId={error ? `${id}-error` : null}
          enterKeyHint="go"
          value={name}
          onValue={setName}
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="sh-error">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
          {busy ? (code ? m.joining() : m.creating()) : code ? m.join_button() : m.create_button()}
        </Button>
        <Button variant="quiet" onClick={onBack} disabled={busy}>
          {m.cancel()}
        </Button>
      </form>
    </Screen>
  );
}

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { isLocale, LOCALE_NAMES, LOCALES, type Locale } from "../../shared/locales";
import { createAndSave, findRoom, isRoomFound } from "../game/membership";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { isSupportedBrowser, useBrowserLocale } from "../ui/locale";
import { Screen } from "../ui/Screen";
import { CODE_RE, errorMessage } from "./entryErrors";
import { NameStep } from "./NameStep";
import { Unsupported } from "./Unsupported";

export interface TopDeps {
  /** 部屋を作って資格を保存し、部屋の番号を返す。 */
  create(name: string, locale: Locale): Promise<string>;
  /** 部屋があるか確かめる（数秒で答える）。無ければ reject（status 404）。 */
  find(code: string): Promise<void>;
  /** このタブで、あると確かめ済みの部屋か（省略時は membership の記録）。 */
  isFound?(code: string): boolean;
}

const defaultDeps: TopDeps = {
  create: createAndSave,
  find: (c) => findRoom(c),
  isFound: isRoomFound,
};

export interface TopProps {
  /**
   * 共有されたリンク（/r/{code} か /?code=）から来たときの番号。開いたらすぐに部屋を確かめる。
   * ただし、確かめ済みの部屋（名前の入力から戻ってきたとき）なら確かめず、番号を入れておくだけにする。
   */
  initialCode?: string;
  /** 部屋を作った（資格を保存した）、または入る部屋があると確かめた。次は /r/{code}。 */
  onEntered(code: string): void;
  deps?: TopDeps;
}

export function Top(props: TopProps) {
  const [locale, setLocale] = useBrowserLocale();
  if (!isSupportedBrowser()) return <Unsupported />;
  return <TopForm {...props} locale={locale} onLocale={setLocale} />;
}

/** トップ：部屋の番号を入れて入るか、部屋を作る。名前は部屋を選んだ後に聞く。 */
function TopForm({
  initialCode = "",
  onEntered,
  deps = defaultDeps,
  locale,
  onLocale,
}: TopProps & { locale: Locale; onLocale(l: Locale): void }) {
  const ids = useId();
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState<"idle" | "checking" | "naming">("idle");
  const [error, setError] = useState<string | null>(null);
  /** いまの確かめの番号。やめたり番号を変えたりした後に届いた結果は捨てる。 */
  const attempt = useRef(0);

  const find = async (c: string) => {
    const mine = ++attempt.current;
    setError(null);
    setStatus("checking");
    try {
      await deps.find(c);
      if (attempt.current === mine) onEntered(c);
    } catch (err) {
      if (attempt.current !== mine) return;
      setStatus("idle");
      setError(errorMessage(err));
    }
  };

  /** StrictMode の二重実行でも、リンクの番号は 1 回だけ確かめる。 */
  const autoChecked = useRef<string | null>(null);
  useEffect(() => {
    // 番号の入ったリンクから来たときは、そのまま部屋を確かめて名前の入力へ進む。
    // 確かめ済み（名前の入力から「戻る」で来た）なら進まない。進むと戻れなくなる
    if (
      !CODE_RE.test(initialCode) ||
      (deps.isFound ?? isRoomFound)(initialCode) ||
      autoChecked.current === initialCode
    )
      return;
    autoChecked.current = initialCode;
    void find(initialCode);
  }, [initialCode]);

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (status !== "idle") return;
    if (!CODE_RE.test(code)) return setError(m.error_code());
    void find(code);
  };

  if (status === "naming") {
    return (
      <NameStep
        onSubmit={async (name) => onEntered(await deps.create(name, locale))}
        onBack={() => setStatus("idle")}
      />
    );
  }

  const checking = status === "checking";
  return (
    <Screen variant="top">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <label
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800 }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </svg>
          <span className="sh-sr-only">{m.language_label()}</span>
          <select
            className="sh-select"
            value={locale}
            onChange={(e) => isLocale(e.target.value) && onLocale(e.target.value)}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l} lang={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <img src="/camera.webp" alt="" width={112} height={112} />
        <h1 className="sh-display sh-brand" style={{ fontSize: 34, letterSpacing: "0.02em" }}>
          {m.app_name()}
        </h1>
      </div>

      <form onSubmit={join} noValidate>
        <Card raised className="sh-stack" style={{ padding: 20 }}>
          <label htmlFor={`${ids}-code`} className="sh-sr-only">
            {m.code_label()}
          </label>
          <input
            id={`${ids}-code`}
            className="sh-input sh-input--code"
            inputMode="numeric"
            enterKeyHint="go"
            autoComplete="off"
            maxLength={6}
            placeholder={m.code_label()}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              setError(null);
              // 番号を直したら、確かめの途中の結果は捨てる
              if (checking) {
                attempt.current++;
                setStatus("idle");
              }
            }}
          />
          {error && (
            <p role="alert" className="sh-error">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={checking} aria-busy={checking}>
            {checking && <span className="sh-spinner" aria-hidden="true" />}
            {m.join_button()}
          </Button>
        </Card>
      </form>

      <div
        className="sh-sub"
        style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}
      >
        <div style={{ flexGrow: 1, height: 2, background: "currentColor", opacity: 0.25 }} />
        <span>{m.or()}</span>
        <div style={{ flexGrow: 1, height: 2, background: "currentColor", opacity: 0.25 }} />
      </div>

      <Button onClick={() => setStatus("naming")} disabled={checking}>
        {m.create_button()}
      </Button>
    </Screen>
  );
}

import { useId, useState, type FormEvent } from 'react';
import { isLocale, LOCALE_NAMES, LOCALES, type Locale } from '../../shared/locales';
import { createAndSave, joinAndSave } from '../game/membership';
import { m } from '../paraglide/messages';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { isSupportedBrowser, useBrowserLocale } from '../ui/locale';
import { Screen } from '../ui/Screen';
import { Connecting } from './Connecting';
import { Unsupported } from './Unsupported';

export interface TopDeps {
  /** 部屋を作って資格を保存し、部屋の番号を返す。 */
  create(name: string, locale: Locale): Promise<string>;
  /** 部屋に入って資格を保存する。部屋がまだ見えない間は onWaiting を呼ぶ。 */
  join(code: string, name: string, opts: { onWaiting?: () => void }): Promise<unknown>;
}

const defaultDeps: TopDeps = { create: createAndSave, join: joinAndSave };

export interface TopProps {
  /** 共有されたリンク（/r/{code}）から来たときの番号。 */
  initialCode?: string;
  /** 部屋の資格を保存できた。 */
  onEntered(code: string): void;
  deps?: TopDeps;
}

const CODE_RE = /^\d{6}$/;
const NAME_MAX = 12;

/** API の失敗を、画面に出す文言にする。 */
function errorMessage(e: unknown): string {
  const status = e instanceof Error ? (e as { status?: number }).status : undefined;
  if (status === 404) return m.error_not_found();
  if (status === 429) return m.error_rate_limited();
  return m.error_failed();
}

export function Top(props: TopProps) {
  const [locale, setLocale] = useBrowserLocale();
  if (!isSupportedBrowser()) return <Unsupported />;
  return <TopForm {...props} locale={locale} onLocale={setLocale} />;
}

function TopForm({
  initialCode = '',
  onEntered,
  deps = defaultDeps,
  locale,
  onLocale,
}: TopProps & { locale: Locale; onLocale(l: Locale): void }) {
  const ids = useId();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'joining' | 'creating' | 'preparing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const busy = status !== 'idle';

  const validName = (): string | null => {
    const n = name.trim();
    const len = [...n].length;
    if (len < 1 || len > NAME_MAX) {
      setError(m.error_name());
      return null;
    }
    return n;
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!CODE_RE.test(code)) return setError(m.error_code());
    const n = validName();
    if (!n) return;
    setError(null);
    setStatus('joining');
    try {
      await deps.join(code, n, { onWaiting: () => setStatus('preparing') });
      onEntered(code);
    } catch (err) {
      setStatus('idle');
      setError(errorMessage(err));
    }
  };

  const create = async () => {
    if (busy) return;
    const n = validName();
    if (!n) return;
    setError(null);
    setStatus('creating');
    try {
      onEntered(await deps.create(n, locale));
    } catch (err) {
      setStatus('idle');
      setError(errorMessage(err));
    }
  };

  if (status === 'preparing') return <Connecting preparing />;

  return (
    <Screen variant="top">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -18 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, paddingTop: 12 }}>
        <div
          className="sh-icon-tile"
          style={{ width: 96, height: 96, background: 'var(--color-accent)', borderRadius: 24 }}
        >
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </div>
        <h1 className="sh-display" style={{ fontSize: 34, letterSpacing: '0.02em' }}>
          {m.app_name()}
        </h1>
        <p className="sh-sub sh-pre" style={{ margin: 0, fontSize: 15, textAlign: 'center', lineHeight: 1.6 }}>
          {m.top_tagline()}
        </p>
      </div>

      <form onSubmit={join} noValidate>
        <Card raised style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="sh-field">
            <label htmlFor={`${ids}-code`} className="sh-label">
              {m.code_label()}
            </label>
            <input
              id={`${ids}-code`}
              className="sh-input sh-input--code"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder={m.code_placeholder()}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
          <div className="sh-field">
            <label htmlFor={`${ids}-name`} className="sh-label">
              {m.name_label()}
            </label>
            <input
              id={`${ids}-name`}
              className="sh-input"
              autoComplete="nickname"
              maxLength={NAME_MAX}
              placeholder={m.name_placeholder()}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="sh-error">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {status === 'joining' ? m.joining() : m.join_button()}
          </Button>
        </Card>
      </form>

      <div className="sh-sub" style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
        <div style={{ flexGrow: 1, height: 2, background: 'currentColor', opacity: 0.25 }} />
        <span>{m.or()}</span>
        <div style={{ flexGrow: 1, height: 2, background: 'currentColor', opacity: 0.25 }} />
      </div>

      <Button onClick={create} disabled={busy}>
        {status === 'creating' ? m.creating() : m.create_button()}
      </Button>

      <p className="sh-sub sh-pre" style={{ margin: 0, marginTop: 'auto', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
        {m.top_note()}
      </p>
    </Screen>
  );
}

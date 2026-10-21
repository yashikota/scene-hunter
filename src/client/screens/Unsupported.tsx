import { useState } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Screen } from "../ui/Screen";

/** WebTransport が無いブラウザ（iOS 26.4 より前の Safari など）。対応ブラウザで開き直せるよう、このページのリンクを渡す。 */
export function Unsupported() {
  const link = typeof location === "undefined" ? "" : location.href;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // コピーできないブラウザでは、入力欄から手で選んでもらう
    }
  };
  return (
    <Screen variant="top" style={{ gap: 20 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          textAlign: "center",
          paddingTop: 60,
        }}
      >
        <div
          className="sh-icon-tile"
          style={{ width: 88, height: 88, background: "var(--color-surface)", borderRadius: 22 }}
        >
          <svg
            width="46"
            height="46"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8M12 17v4M9 8l6 6M15 8l-6 6" />
          </svg>
        </div>
        <h1 className="sh-display" style={{ fontSize: 24, lineHeight: 1.4 }}>
          {m.unsupported_title()}
        </h1>
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {[m.unsupported_phone(), m.unsupported_desktop()].map((t) => (
          <li
            key={t}
            className="sh-card"
            style={{
              borderRadius: "var(--radius-button)",
              padding: "12px 14px",
              fontSize: 15,
              fontWeight: 800,
            }}
          >
            {t}
          </li>
        ))}
      </ul>

      <div className="sh-field" style={{ marginTop: "auto", gap: 8 }}>
        <label htmlFor="page-link" className="sh-label">
          {m.page_link()}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="page-link"
            className="sh-input"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            style={{ flexGrow: 1, fontSize: 15 }}
          />
          <Button
            variant="primary"
            onClick={copy}
            style={{ fontSize: 15, padding: "0 16px", minHeight: 48 }}
          >
            {copied ? m.copied() : m.copy()}
          </Button>
        </div>
      </div>
    </Screen>
  );
}

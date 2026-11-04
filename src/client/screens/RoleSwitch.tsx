import { useState } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";

export function RoleSwitch({
  role,
  onSwitch,
  disabled = false,
}: {
  role: "gm" | "admin";
  onSwitch(role: "gm" | "admin"): Promise<void>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const choose = async (next: "gm" | "admin") => {
    if (next === role || busy || disabled) return;
    setBusy(true);
    setFailed(false);
    try {
      await onSwitch(next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label={m.host_role_heading()} style={{ display: "grid", gap: 8 }}>
      <h2 className="sh-display" style={{ fontSize: 17 }}>
        {m.host_role_heading()}
      </h2>
      <div style={{ display: "grid", gap: 8 }}>
        <Button
          variant={role === "admin" ? "primary" : "quiet"}
          aria-pressed={role === "admin"}
          disabled={disabled || busy || role === "admin"}
          onClick={() => void choose("admin")}
        >
          {m.become_admin_button()}
        </Button>
        <Button
          variant={role === "gm" ? "primary" : "quiet"}
          aria-pressed={role === "gm"}
          disabled={disabled || busy || role === "gm"}
          onClick={() => void choose("gm")}
        >
          {m.become_gm_button()}
        </Button>
      </div>
      <p className="sh-sub" style={{ margin: 0, fontSize: 13 }} aria-live="polite">
        {role === "admin" ? m.host_admin_help() : m.host_gm_help()}
      </p>
      {failed && (
        <p role="alert" className="sh-error">
          {m.error_failed()}
        </p>
      )}
    </section>
  );
}

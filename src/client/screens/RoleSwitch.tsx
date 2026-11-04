import { useId, useState } from "react";
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
  const descriptionId = useId();
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
      <Button
        variant="quiet"
        aria-describedby={descriptionId}
        disabled={disabled || busy}
        onClick={() => void choose(role === "gm" ? "admin" : "gm")}
      >
        {role === "gm" ? m.become_admin_button() : m.become_gm_button()}
      </Button>
      <p
        id={descriptionId}
        className="sh-sub"
        style={{ margin: 0, fontSize: 13 }}
        aria-live="polite"
      >
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

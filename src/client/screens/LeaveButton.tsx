import { useState } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { ConfirmSheet } from "../ui/Sheet";

/** プレイヤーの「部屋を出る」。押し間違えで抜けないよう、真ん中の確かめを挟む。 */
export function LeaveButton({ onLeave }: { onLeave(): void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button variant="quiet" onClick={() => setConfirming(true)} aria-haspopup="dialog">
        {m.leave_button()}
      </Button>
      <ConfirmSheet
        open={confirming}
        title={m.leave_confirm()}
        confirmLabel={m.leave_button()}
        onConfirm={onLeave}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

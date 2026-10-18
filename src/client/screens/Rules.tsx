import { useState } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

/** ロビーに置く「遊び方」のボタン。押すとルールのシートを出す。 */
export function RulesButton({ rounds, limitSec }: { rounds: number; limitSec: number }) {
  const [open, setOpen] = useState(false);
  const rules = [
    m.rules_1(),
    m.rules_2(),
    m.rules_3({ sec: limitSec }),
    m.rules_4(),
    m.rules_5(),
    m.rules_6(),
    m.rules_7({ rounds }),
  ];
  return (
    <>
      <Button variant="quiet" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {m.rules_button()}
      </Button>
      {open && (
        <Sheet title={m.rules_button()} onCancel={() => setOpen(false)}>
          <ol className="sh-rules">
            {rules.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ol>
          <Button variant="quiet" onClick={() => setOpen(false)} autoFocus>
            {m.close()}
          </Button>
        </Sheet>
      )}
    </>
  );
}

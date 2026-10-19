import { useRef, useState } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { RULE_STEPS, RulesArt } from "./RulesArt";

/** 指を横にこれだけ動かしたら、ステップを送る。 */
const SWIPE_PX = 40;

/** ロビーに置く「遊び方」のボタン。押すとルールのシートを出す。 */
export function RulesButton({ rounds, limitSec }: { rounds: number; limitSec: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="quiet" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {m.rules_button()}
      </Button>
      {open && <RulesSheet rounds={rounds} limitSec={limitSec} onClose={() => setOpen(false)} />}
    </>
  );
}

/** ルールを 1 つずつ、動く絵を添えて見せる。左右のスワイプと矢印キーでも送れる。 */
function RulesSheet({
  rounds,
  limitSec,
  onClose,
}: {
  rounds: number;
  limitSec: number;
  onClose(): void;
}) {
  const rules = [
    m.rules_1(),
    m.rules_2(),
    m.rules_3({ sec: limitSec }),
    m.rules_4(),
    m.rules_5(),
    m.rules_6(),
    m.rules_7({ rounds }),
  ];
  // dir はステップを送った向き。新しいステップを入ってくる向きから滑り込ませる
  const [{ step, dir }, setNav] = useState({ step: 0, dir: 1 });
  const swipeX = useRef<number | null>(null);
  const last = step === RULE_STEPS - 1;
  const go = (d: 1 | -1) => {
    const next = step + d;
    if (next >= 0 && next < RULE_STEPS) setNav({ step: next, dir: d });
  };

  return (
    <Sheet title={m.rules_button()} onCancel={onClose}>
      <div
        className="sh-rules"
        onPointerDown={(e) => (swipeX.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipeX.current === null) return;
          const dx = e.clientX - swipeX.current;
          swipeX.current = null;
          if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
      >
        <div key={step} className={`sh-rule ${dir > 0 ? "sh-rule--next" : "sh-rule--prev"}`}>
          <RulesArt step={step} />
          <p className="sh-rule-text" aria-live="polite">
            <span className="sh-rule-num">{step + 1}</span>
            {rules[step]}
          </p>
        </div>
        <div className="sh-rule-dots" aria-hidden="true">
          {rules.map((_, i) => (
            <span key={i} className={i === step ? "is-current" : i < step ? "is-seen" : ""} />
          ))}
        </div>
        <div className="sh-row sh-row--even">
          <Button variant="quiet" onClick={() => go(-1)} disabled={step === 0}>
            {m.rules_prev()}
          </Button>
          <Button variant="primary" onClick={() => (last ? onClose() : go(1))} autoFocus>
            {last ? m.close() : m.rules_next()}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

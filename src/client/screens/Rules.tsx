import { AnimatePresence, type PanInfo } from "motion/react";
import * as mo from "motion/react-m";
import { useState } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { SMOOTH, SPRING } from "../ui/motion";
import { Sheet } from "../ui/Sheet";
import { RULE_STEPS, RulesArt } from "./RulesArt";

/** 指をこれだけ横に動かすか、これより速く払ったら、ステップを送る。 */
const SWIPE_PX = 60;
const SWIPE_SPEED = 400;

/** ロビーに置く「遊び方」のボタン。押すとルールのシートを出す。 */
export function RulesButton({ rounds, limitSec }: { rounds: number; limitSec: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="quiet" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {m.rules_button()}
      </Button>
      <Sheet open={open} center closable title={m.rules_button()} onCancel={() => setOpen(false)}>
        <RulesSteps rounds={rounds} limitSec={limitSec} onClose={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

/** ステップは送った向き（dir）から滑り込み、反対へ抜けていく。 */
const slide = {
  enter: (dir: number) => ({ x: dir * 120, opacity: 0, rotate: dir * 3 }),
  center: { x: 0, opacity: 1, rotate: 0 },
  exit: (dir: number) => ({ x: dir * -120, opacity: 0, rotate: dir * -3 }),
};

/** ルールを 1 つずつ、動く絵を添えて見せる。カードは指で横に払っても、矢印キーでも送れる。 */
function RulesSteps({
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
  const [{ step, dir }, setNav] = useState({ step: 0, dir: 1 });
  const last = step === RULE_STEPS - 1;
  const go = (d: 1 | -1) => {
    const next = step + d;
    if (next >= 0 && next < RULE_STEPS) setNav({ step: next, dir: d });
  };
  const swipe = (_: unknown, { offset, velocity }: PanInfo) => {
    if (offset.x < -SWIPE_PX || velocity.x < -SWIPE_SPEED) go(1);
    else if (offset.x > SWIPE_PX || velocity.x > SWIPE_SPEED) go(-1);
  };

  return (
    <div
      className="sh-rules"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <div className="sh-rule-stage">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <mo.div
            key={step}
            className="sh-rule"
            custom={dir}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SMOOTH}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.5}
            onDragEnd={swipe}
          >
            <RulesArt step={step} />
            <p className="sh-rule-text" aria-hidden="true">
              <mo.span
                className="sh-rule-num"
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ ...SPRING, delay: 0.1 }}
              >
                {step + 1}
              </mo.span>
              {rules[step]}
            </p>
          </mo.div>
        </AnimatePresence>
      </div>
      {/* カードは送るたびに作り直すので、読み上げはカードの外の、消えない場所から出す */}
      <p className="sh-sr-only" aria-live="polite">
        {`${step + 1} / ${RULE_STEPS}: ${rules[step]}`}
      </p>
      <div className="sh-rule-dots" aria-hidden="true">
        {rules.map((_, i) => (
          <mo.span
            key={i}
            className={i === step ? "is-current" : i < step ? "is-seen" : ""}
            animate={{ width: i === step ? 22 : 8 }}
            transition={SPRING}
          />
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
  );
}

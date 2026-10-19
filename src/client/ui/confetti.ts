import confetti from "canvas-confetti";
import { MotionGlobalConfig } from "motion/react";
import { prefersReducedMotion } from "./motion";

/** 紙吹雪の色。tokens.css のアクセント、金、青に、白と景色の緑を足す。 */
const COLORS = ["#ff9447", "#ffe36b", "#3d6bf0", "#7cc77a", "#ffffff"];

function off(): boolean {
  return prefersReducedMotion() || MotionGlobalConfig.skipAnimations === true;
}

/** el のあたりから、紙吹雪を一度はじけさせる。 */
export function burstFrom(el: Element | null, count = 90): void {
  if (off() || !el) return;
  const r = el.getBoundingClientRect();
  void confetti({
    particleCount: count,
    spread: 80,
    startVelocity: 38,
    scalar: 0.9,
    colors: COLORS,
    origin: {
      x: (r.left + r.width / 2) / innerWidth,
      y: (r.top + r.height / 2) / innerHeight,
    },
  });
}

/** 画面の左右の下から、ms のあいだ紙吹雪を吹き上げる。止める関数を返す。 */
export function celebrate(ms = 3200): () => void {
  if (off()) return () => {};
  const end = Date.now() + ms;
  let frame = 0;
  const tick = () => {
    for (const x of [0, 1]) {
      void confetti({
        particleCount: 3,
        angle: x === 0 ? 60 : 120,
        spread: 60,
        startVelocity: 55,
        origin: { x, y: 0.85 },
        colors: COLORS,
      });
    }
    if (Date.now() < end) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

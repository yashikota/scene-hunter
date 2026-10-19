import {
  LazyMotion,
  MotionConfig,
  MotionGlobalConfig,
  animate,
  domMax,
  useReducedMotion,
} from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

/**
 * 動きの土台。motion/react-m の部品（mo.div など）は、この下でだけ動く。
 * 機能は LazyMotion でまとめて読み込み、端末で動きを減らす設定の人には transform の動きを止める。
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** はずむ動き。出てくる物に使う。 */
export const SPRING = { type: "spring", stiffness: 420, damping: 26 } as const;
/** 落ち着いた動き。並び替えやシートに使う。 */
export const SMOOTH = { type: "spring", stiffness: 300, damping: 32 } as const;

/** 動きを減らす設定か。紙吹雪のような、MotionConfig が止めない動きのために見る。 */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 演出を飛ばして、終わった姿をすぐ出すか（動きを減らす設定の人と、テスト）。 */
export function useStill(): boolean {
  return Boolean(useReducedMotion()) || MotionGlobalConfig.skipAnimations === true;
}

/** from から to まで数字を回して見せる。演出を飛ばすときは、はじめから to を出す。 */
export function CountUp({
  from,
  to,
  delay = 0,
  duration = 1.1,
  format = String,
}: {
  from: number;
  to: number;
  /** 秒。 */
  delay?: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const still = useStill();
  const [value, setValue] = useState(still ? to : from);
  useEffect(() => {
    if (still) {
      setValue(to);
      return;
    }
    const controls = animate(from, to, {
      delay,
      duration,
      ease: [0.2, 0.7, 0.2, 1],
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [from, to, delay, duration, still]);
  return <>{format(value)}</>;
}

import { useEffect } from "react";

/**
 * active の間、画面が消えないよう Screen Wake Lock を取る。タブが隠れると外れるので、見えるようになったら取り直す。
 * 対応していないブラウザや、取れなかった（省電力モードなど）ときは何もしない。
 * GM の端末が画面ロックで止まると、プレイヤーの撮影の時刻（GM の受信時刻）が狂い、ヒントも止まるため。
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    const wakeLock = navigator.wakeLock;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      try {
        const s = await wakeLock.request("screen");
        if (stopped) void s.release().catch(() => {});
        else sentinel = s;
      } catch (e) {
        console.warn("画面の消灯を止められなかった", e);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}

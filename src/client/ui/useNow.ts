import { useEffect, useState } from 'react';

/** 一定の間隔で現在時刻（ミリ秒）を返す。残り時間などの表示を動かすために使う。 */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

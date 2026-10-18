import { getLocale } from "../paraglide/runtime";

// 数の書式は、いまの画面の言語の Intl に任せる（1,150 / 1.150 など）。

export const formatNumber = (n: number): string => new Intl.NumberFormat(getLocale()).format(n);

/** 速さの倍率：小数 2 桁（0.90）。 */
export const formatMultiplier = (n: number): string =>
  new Intl.NumberFormat(getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    n,
  );

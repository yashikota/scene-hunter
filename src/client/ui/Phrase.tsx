import { Fragment, useEffect, useState } from "react";
import type { Locale } from "../../shared/locales";
import { getLocale } from "../paraglide/runtime";

/**
 * 日本語と中国語の文を、BudouX で文節に分けて、文節の切れ目でだけ改行させる。
 * 文節の間に <wbr> を入れ、CSS の word-break: keep-all でそれ以外の場所では折り返さない。
 * BudouX の辞書は重いので、使う画面（紹介のページ）を開いたときに読み込む。
 */
type Parse = (text: string) => string[];

let parsers: Partial<Record<Locale, Parse>> | null = null;
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  loading ??= import("budoux").then((b) => {
    const ja = b.loadDefaultJapaneseParser();
    const hans = b.loadDefaultSimplifiedChineseParser();
    const hant = b.loadDefaultTraditionalChineseParser();
    parsers = {
      ja: (t) => ja.parse(t),
      "zh-Hans": (t) => hans.parse(t),
      "zh-Hant": (t) => hant.parse(t),
    };
  });
  return loading;
}

/** BudouX を読み込み、読み込めたら描き直す。読み込むまでは、文をそのまま出す。 */
export function useBudoux(): void {
  const [, setReady] = useState(parsers !== null);
  useEffect(() => {
    let alive = true;
    void load().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
}

/** 文節の切れ目に <wbr> を入れた文。BudouX の無い言語では、文をそのまま出す。 */
export function Phrase({ children }: { children: string }) {
  const parse = parsers?.[getLocale() as Locale];
  if (!parse) return <>{children}</>;
  return (
    <>
      {parse(children).map((chunk, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {chunk}
        </Fragment>
      ))}
    </>
  );
}

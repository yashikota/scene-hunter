// 紹介のページを言語ごとに HTML へ書き出す（scripts/prerender-lp.mjs が vite の ssrLoadModule で読む）。
// 画面はブラウザで描き直すので、ここで作る HTML は検索エンジンと最初の表示のためのもの。
import { renderToString } from "react-dom/server";
import type { Locale } from "../shared/locales";
import { setLocale } from "./paraglide/runtime";
import { LandingIn } from "./screens/Landing";
import { MotionRoot } from "./ui/motion";
import { loadBudoux } from "./ui/Phrase";
import { lpHead, lpHeadTags } from "./ui/seo";

export async function renderLp(l: Locale): Promise<{ html: string; title: string; head: string }> {
  await loadBudoux();
  setLocale(l, { reload: false });
  const html = renderToString(
    <MotionRoot>
      <LandingIn lang={l} />
    </MotionRoot>,
  );
  const h = lpHead(l);
  return { html, title: h.title, head: lpHeadTags(h) };
}

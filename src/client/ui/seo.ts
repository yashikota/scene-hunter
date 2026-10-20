import { LOCALES, type Locale } from "../../shared/locales";
import { m } from "../paraglide/messages";

/** 本番のオリジン。canonical と hreflang、sitemap には絶対 URL が要る。 */
export const SITE = "https://game.scene-hunter.workers.dev";

/** 言語を決めた紹介のページの URL のパス。 */
export const lpPath = (l: Locale) => `/lp/${l}`;

export interface LpHead {
  lang: Locale;
  title: string;
  description: string;
  canonical: string;
  /** hreflang の組。x-default は言語を決めない /lp。 */
  alternates: { hreflang: string; href: string }[];
  jsonLd: Record<string, unknown>;
}

export function lpHead(l: Locale): LpHead {
  const description = `${m.lp_tagline({}, { locale: l })} ${m.lp_about_lead({}, { locale: l })}`;
  const canonical = `${SITE}${lpPath(l)}`;
  return {
    lang: l,
    title: m.lp_meta_title({}, { locale: l }),
    description,
    canonical,
    alternates: [
      ...LOCALES.map((x) => ({ hreflang: x, href: `${SITE}${lpPath(x)}` })),
      { hreflang: "x-default", href: `${SITE}/lp` },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "VideoGame",
      name: m.app_name({}, { locale: l }),
      description,
      url: canonical,
      image: `${SITE}/og.jpg`,
      inLanguage: l,
      genre: "Party game",
      gamePlatform: "Web browser",
      applicationCategory: "GameApplication",
      operatingSystem: "Android",
      numberOfPlayers: { "@type": "QuantitativeValue", minValue: 2 },
      offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
    },
  };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 書き出す HTML の <head> に足すタグ（scripts/prerender-lp.mjs が使う）。 */
export function lpHeadTags(h: LpHead): string {
  return [
    `<meta name="description" content="${esc(h.description)}" />`,
    `<link rel="canonical" href="${h.canonical}" />`,
    ...h.alternates.map(
      (a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`,
    ),
    `<meta property="og:description" content="${esc(h.description)}" />`,
    `<meta property="og:locale" content="${h.lang.replace("-", "_")}" />`,
    // JSON の中の </script> で script 要素が閉じないよう、< を逃がす
    `<script type="application/ld+json">${JSON.stringify(h.jsonLd).replace(/</g, "\\u003c")}</script>`,
  ].join("\n    ");
}

function setMeta(attr: "name" | "property", key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/** 画面の中で言語が決まったときに、タイトル、説明、canonical を合わせる（JS を動かす検索エンジンとタブの名前のため）。 */
export function applyLpHead(l: Locale): void {
  const h = lpHead(l);
  document.title = h.title;
  setMeta("name", "description", h.description);
  setMeta("property", "og:title", h.title);
  setMeta("property", "og:description", h.description);
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = h.canonical;
}

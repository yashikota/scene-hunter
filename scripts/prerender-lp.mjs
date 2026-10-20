// ビルドのあとに、紹介のページ（/lp/{言語}）を言語ごとの HTML に書き出し、sitemap.xml を作る。
// JS を動かさない検索エンジンにも本文、タイトル、説明、hreflang が見えるようにする。
// 書き出した HTML もブラウザでは React が描き直す（同じ中身）。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite-plus";

const OUT = "dist/client";
const template = readFileSync(`${OUT}/index.html`, "utf8");

// API と Cloudflare の binding は要らないので、画面だけの設定で読む（vite.config.ts の SH_CLIENT_ONLY）
process.env.SH_CLIENT_ONLY = "1";
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "warn",
});
try {
  const { renderLp } = await server.ssrLoadModule("/src/client/prerender.tsx");
  const { LOCALES } = await server.ssrLoadModule("/src/shared/locales.ts");
  const { SITE, lpPath } = await server.ssrLoadModule("/src/client/ui/seo.ts");

  mkdirSync(`${OUT}/lp`, { recursive: true });
  for (const l of LOCALES) {
    const { html, title, head } = await renderLp(l);
    const page = template
      .replace(/<html lang="[^"]*">/, `<html lang="${l}">`)
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
      .replace(
        /<meta property="og:url" content="[^"]*" \/>/,
        `<meta property="og:url" content="${SITE}${lpPath(l)}" />`,
      )
      .replace(
        /<meta property="og:title" content="[^"]*" \/>/,
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
      )
      // トップの説明（index.html）は、その言語の説明に置き換える
      .replace(/\s*<meta\s+name="description"[^>]*>/, "")
      .replace("</head>", `  ${head}\n  </head>`)
      // 書き出しでは出てくる途中の動き（透明、ずらした位置）を止め、本文が見える状態で置く
      .replace('<div id="root"></div>', `<div id="root">${stillStyles(html)}</div>`);
    writeFileSync(`${OUT}/lp/${l}.html`, page);
  }

  const urls = LOCALES.map((l) => {
    const alternates = [
      ...LOCALES.map(
        (x) => `    <xhtml:link rel="alternate" hreflang="${x}" href="${SITE}${lpPath(x)}" />`,
      ),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/lp" />`,
    ].join("\n");
    return `  <url>\n    <loc>${SITE}${lpPath(l)}</loc>\n${alternates}\n  </url>`;
  });
  writeFileSync(
    `${OUT}/sitemap.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>\n    <loc>${SITE}/</loc>\n  </url>
${urls.join("\n")}
</urlset>
`,
  );
  console.log(`prerendered /lp for ${LOCALES.length} locales and wrote sitemap.xml`);
} finally {
  await server.close();
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Motion の initial（opacity:0 と transform）を style から外す。 */
function stillStyles(html) {
  return html.replace(/ style="([^"]*)"/g, (_, css) => {
    const kept = css
      .split(";")
      .filter((d) => d && !/^\s*(opacity|transform)\s*:/.test(d))
      .join(";");
    return kept ? ` style="${kept}"` : "";
  });
}

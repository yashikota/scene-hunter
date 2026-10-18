// 画面の一覧（/__screens）をスクリーンショットに撮る。
// 先に `SH_CLIENT_ONLY=1 npx vp dev --port 5199` を起動しておく。
// 使い方: node scripts/screens.mjs <出力先> [言語,...] [画面の id,...]
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [out = "shots", langs = "ja", only = ""] = process.argv.slice(2);
const base = process.env.SCREENS_URL ?? "http://localhost:5199/__screens";
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
];

const browser = await chromium.launch({
  // Playwright が期待する版が入っていないことがあるので、入っている Chrome for Testing を使う
  executablePath:
    process.env.CHROME_PATH ??
    join(homedir(), ".cache/ms-playwright/chromium-1234/chrome-linux64/chrome"),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const page = await browser.newPage();
await page.goto(base);
await page.waitForSelector("main li a");
const ids = only
  ? only.split(",")
  : await page.$$eval("main li a", (as) =>
      as.map((a) => new URL(a.href).searchParams.get("screen")),
    );

for (const lang of langs.split(",")) {
  for (const vp of VIEWPORTS) {
    const dir = join(out, vp.name, lang);
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      permissions: ["camera"],
      reducedMotion: "reduce",
    });
    for (const id of ids) {
      // 1 枚ごとにページを作り直す（カメラや dev サーバーの接続を持ち越さない）
      const p = await ctx.newPage();
      await p.goto(`${base}?screen=${id}&lang=${lang}`);
      await p.waitForLoadState("networkidle");
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(700);
      await p.screenshot({ path: join(dir, `${id}.png`), fullPage: true });
      await p.close();
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`saved ${ids.length} screens to ${out}`);

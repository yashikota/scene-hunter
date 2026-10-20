import { defineConfig, devices } from "@playwright/test";

// 本番の通しのテスト（pnpm e2e:prod）：デプロイ済みの Worker に本物のブラウザでつなぎ、Cloudflare の MoQ、R2、
// Workers AI をそのまま使う。Relay が作られ（cron が 12 時間後に消す）、AI もヒントの回数分だけ使うので、CI では
// 流さず、デプロイの後に手で流す。

const BASE_URL = process.env.SH_PROD_URL ?? "https://game.scene-hunter.workers.dev";

export default defineConfig({
  testDir: "tests/prod",
  workers: 1,
  fullyParallel: false,
  // Workers AI のヒントは混み具合で 1 分を超えることがあり、3 ラウンド分を待つ
  timeout: 900_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    locale: "ja-JP",
    permissions: ["camera"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
  },
  projects: [{ name: "chromium" }],
});

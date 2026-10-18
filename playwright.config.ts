import { generateKeyPairSync, randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

// e2e テスト：本物のブラウザで void dev のアプリを動かし、手元の moq-relay（scripts/e2e-relay.sh）につなぐ。
// SH_E2E=1 で起動した void dev は、Cloudflare 専用の依存（MoQ の API、R2 の署名付き URL、AI）を手元の代わりに
// 差し替える（src/server/e2e.ts）。秘密情報は使わず、サーバーの鍵は起動のたびにここで作る。

// 5173 は普段の pnpm dev が使うので、e2e は別のポートで起動する。
const PORT = 5199;
const BASE_URL = `http://localhost:${PORT}`;
const RELAY_URL = "http://localhost:4443/";

const UNUSED_SECRETS = [
  "CF_API_TOKEN",
  "CF_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

/** 起動のたびに作る使い捨ての鍵（Ed25519 の署名鍵と HMAC の鍵）。本番の鍵とは関係ない。 */
function e2eServerEnv(): Record<string, string> {
  // webServer を起動するのは親プロセスだけ。テストのワーカーが設定を読み直したときは作らない。
  if (process.env.TEST_WORKER_INDEX !== undefined) return {};
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url");
  const raw = publicKey.export({ format: "jwk" }).x ?? "";
  return {
    SH_E2E: "1",
    SH_E2E_RELAY_URL: RELAY_URL,
    HMAC_SECRET: randomBytes(32).toString("base64url"),
    SERVER_SIGNING_KEY: pkcs8,
    VITE_SERVER_PUBLIC_KEY: raw,
    // env.ts で必須の値。worker の起動時に確かめられるので埋めるが、e2e のモードでは使わない。
    ...Object.fromEntries(UNUSED_SECRETS.map((k) => [k, "e2e-unused"])),
  };
}

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  // 1 つのテストが複数のブラウザ（GM とプレイヤー）を動かすので、テストどうしは並べずに 1 つずつ流す。
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: ci ? 1 : 0,
  forbidOnly: ci,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
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
  webServer: [
    {
      command: "scripts/e2e-relay.sh",
      url: `${RELAY_URL}certificate.sha256`,
      // 初回は moq-relay を落とすので長めに待つ
      timeout: 120_000,
      // 4443 番で別の何か（設定や版の違う relay）が動いていたら、使い回さずに起動の失敗で知らせる
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `pnpm dev --port ${PORT} --strictPort`,
      url: `${BASE_URL}/api/health`,
      timeout: 120_000,
      // 手元で別に動かしている dev サーバー（SH_E2E なし）を使ってしまわないよう、使い回さない。
      reuseExistingServer: false,
      env: e2eServerEnv(),
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});

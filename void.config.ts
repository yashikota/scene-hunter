import { defineConfig } from 'void/config';

// Rate Limiting binding の period は 10 か 60 秒しか選べない。
const rateLimit = (name: string, namespaceId: string, limit: number) => ({
  name,
  namespace_id: namespaceId,
  simple: { limit, period: 60 },
});

// e2e テストのモード（SH_E2E=1）は手元の dev サーバーだけで使う。設定を読むのは vite（dev / build）と void の CLI
// （deploy など）で、どちらも argv[2] がコマンド名になる。SH_E2E が残ったシェルでビルドやデプロイをすると
// AI の binding の無い Worker ができてしまうので、そのときは止める。
const command = process.argv[2];
if (process.env.SH_E2E && (command === 'build' || command === 'deploy')) {
  throw new Error(
    `SH_E2E is set (${JSON.stringify(process.env.SH_E2E)}); refusing to run "${command}". Unset SH_E2E before building or deploying.`,
  );
}
const e2eDev = process.env.SH_E2E === '1' && command === 'dev';

export default defineConfig({
  target: 'cloudflare',
  // void/kv と void/storage の import ではなく素の binding を使うので、明示する。
  // e2e テスト（SH_E2E=1 の dev）では AI を呼ばない（src/server/e2e.ts）。Workers AI の binding は dev でも
  // Cloudflare につなぐので、認証の無い CI では dev が起動できない。そのため e2e の dev のときだけ binding を外す。
  inference: {
    bindings: { kv: true, storage: true, ...(e2eDev ? { ai: false } : {}) },
  },
  cloudflare: {
    name: 'scene-hunter',
    // 本番は workers.dev で公開する。preview_urls は Void がデプロイ前の版を確かめるのに使う。
    workers_dev: true,
    preview_urls: true,
    // 省略すると Void は既存の routes を引き継ごうとし、Void 以外が作った版（secret の変更など）の直後に止まる。
    routes: [],
    // Workers Logs（console 出力と呼び出しログ）とトレースを全件残す。
    observability: {
      enabled: true,
      head_sampling_rate: 1,
      logs: { enabled: true, invocation_logs: true },
      traces: { enabled: true, head_sampling_rate: 1 },
    },
    ratelimits: [
      rateLimit('RL_CREATE', '1001', 2), // IP
      rateLimit('RL_JOIN', '1002', 10), // IP
      rateLimit('RL_HINTS', '1003', 3), // 部屋
      rateLimit('RL_UPLOAD', '1004', 5), // 部屋とプレイヤー
    ],
  },
});

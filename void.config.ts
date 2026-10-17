import { defineConfig } from 'void/config';

// Rate Limiting binding の period は 10 か 60 秒しか選べない。
const rateLimit = (name: string, namespaceId: string, limit: number) => ({
  name,
  namespace_id: namespaceId,
  simple: { limit, period: 60 },
});

export default defineConfig({
  target: 'cloudflare',
  // void/kv と void/storage の import ではなく素の binding を使うので、明示する。
  inference: { bindings: { kv: true, storage: true } },
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

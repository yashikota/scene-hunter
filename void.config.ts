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
    ratelimits: [
      rateLimit('RL_CREATE', '1001', 2), // IP
      rateLimit('RL_JOIN', '1002', 10), // IP
      rateLimit('RL_HINTS', '1003', 3), // 部屋
      rateLimit('RL_UPLOAD', '1004', 5), // 部屋とプレイヤー
    ],
  },
});

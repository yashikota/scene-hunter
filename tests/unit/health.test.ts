import { describe, expect, it, vi } from 'vite-plus/test';
import { GET } from '../../routes/api/health';

// 回数制限の binding を選ぶとき e2e のモードか（SH_E2E）を読む。worker の外なので void/env を差し替える。
vi.mock('void/env', () => ({ env: {} }));

describe('GET /api/health', () => {
  it('ok: true を返す', async () => {
    const res = await GET({} as never);
    expect(res).toEqual({ ok: true });
  });
});

describe('GET /api/rooms/:code', async () => {
  const { GET: exists } = await import('../../routes/api/rooms/[code]/index');
  const ctx = (code: string, ok = true) =>
    ({
      req: { param: () => code, header: () => '203.0.113.1' },
      env: {
        RL_JOIN: { limit: async () => ({ success: ok }) },
        KV: { get: async (k: string) => (k === 'room:111111' ? { code: '111111' } : null) },
      },
      json: (body: unknown, status: number) => ({ body, status }),
    }) as never;

  it('無い部屋も 404 にせず { exists: false } を返す（本番では GET の 404 が SPA の HTML になるため）', async () => {
    expect(await exists(ctx('111111'))).toEqual({ exists: true });
    expect(await exists(ctx('000000'))).toEqual({ exists: false });
    expect(await exists(ctx('abc'))).toEqual({ exists: false });
  });

  it('上限を超えたら 429', async () => {
    expect(await exists(ctx('111111', false))).toMatchObject({ status: 429 });
  });
});

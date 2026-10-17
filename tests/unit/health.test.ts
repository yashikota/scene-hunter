import { describe, expect, it } from 'vite-plus/test';
import { GET } from '../../routes/api/health';

describe('GET /api/health', () => {
  it('ok: true を返す', async () => {
    const res = await GET({} as never);
    expect(res).toEqual({ ok: true });
  });
});

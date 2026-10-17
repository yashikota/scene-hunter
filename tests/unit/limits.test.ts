import { describe, expect, it } from 'vite-plus/test';
import { allow } from '../../src/server/limits';

describe('allow', () => {
  it('success: true なら true、キーをそのまま渡す', async () => {
    const keys: string[] = [];
    const l = { limit: async (o: { key: string }) => (keys.push(o.key), { success: true }) };
    expect(await allow(l, '1.2.3.4')).toBe(true);
    expect(keys).toEqual(['1.2.3.4']);
  });

  it('success: false なら false', async () => {
    expect(await allow({ limit: async () => ({ success: false }) }, 'k')).toBe(false);
  });
});

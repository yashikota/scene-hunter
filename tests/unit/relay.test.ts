import { describe, expect, it } from 'vite-plus/test';
import { createRelayApi, moqUrl } from '../../src/server/relay';

const created = {
  success: true,
  errors: [],
  result: {
    uid: 'uid-1',
    created: '2026-10-17T03:02:18.430477Z',
    name: 'sh-test',
    issuers: [
      {
        type: 'cloudflare_jwt',
        issuer: 'cloudflare',
        cloudflare_tokens: [
          { jti: 'a', operations: ['publish', 'subscribe'], label: 'pub', secret: 'PUB' },
          { jti: 'b', operations: ['subscribe'], label: 'sub', secret: 'SUB' },
        ],
      },
    ],
    config: { upstreams: {} },
  },
};

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('relay api', () => {
  it('create returns the publish token', async () => {
    const { f, calls } = fakeFetch(201, created);
    const api = createRelayApi({ accountId: 'acc', apiToken: 'tok', fetch: f });
    expect(await api.create('sh-test')).toEqual({ uid: 'uid-1', token: 'PUB' });
    expect(calls[0].url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/moq/relays');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('throws on 4xx', async () => {
    const { f } = fakeFetch(403, { success: false, errors: [] });
    const api = createRelayApi({ accountId: 'acc', apiToken: 'tok', fetch: f });
    await expect(api.create('x')).rejects.toThrow(Error);
    await expect(api.delete('u')).rejects.toThrow(Error);
  });

  it('delete calls DELETE on the uid', async () => {
    const { f, calls } = fakeFetch(200, { success: true });
    const api = createRelayApi({ accountId: 'acc', apiToken: 'tok', fetch: f });
    await api.delete('uid-1');
    expect(calls[0].url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/moq/relays/uid-1');
    expect(calls[0].init.method).toBe('DELETE');
  });

  it('list returns result', async () => {
    const rows = [{ uid: 'u', name: 'n', created: 'c', modified: 'm' }];
    const { f, calls } = fakeFetch(200, { success: true, result: rows });
    const api = createRelayApi({ accountId: 'acc', apiToken: 'tok', fetch: f });
    expect(await api.list()).toEqual(rows);
    expect(calls[0].url).toContain('/moq/relays?per_page=1000');
  });

  it('moqUrl', () =>
    expect(moqUrl('T')).toBe('https://draft-16.cloudflare.mediaoverquic.com/T'));
});

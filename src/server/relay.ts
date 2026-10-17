const API_BASE = 'https://api.cloudflare.com/client/v4';

export interface RelayApi {
  create(name: string): Promise<{ uid: string; token: string }>;
  delete(uid: string): Promise<void>;
  list(): Promise<{ uid: string; name: string; created: string }[]>;
}

interface CfToken {
  operations: string[];
  secret: string;
}

interface CfEnvelope<T> {
  success: boolean;
  result: T;
}

export function moqUrl(token: string): string {
  return `https://draft-16.cloudflare.mediaoverquic.com/${token}`;
}

export function createRelayApi(opts: {
  accountId: string;
  apiToken: string;
  fetch?: typeof fetch;
}): RelayApi {
  const doFetch = opts.fetch ?? fetch;
  const base = `${API_BASE}/accounts/${opts.accountId}/moq/relays`;

  async function call(method: string, url: string, body?: unknown): Promise<Response> {
    const res = await doFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${opts.apiToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Cloudflare MoQ API ${method} failed: HTTP ${res.status}`);
    }
    return res;
  }

  return {
    async create(name) {
      const res = await call('POST', base, { name });
      const json = (await res.json()) as CfEnvelope<{
        uid: string;
        issuers: { cloudflare_tokens: CfToken[] }[];
      }>;
      const tokens = json.result.issuers?.[0]?.cloudflare_tokens ?? [];
      const publisher = tokens.find((t) => t.operations.includes('publish'));
      if (!publisher) throw new Error('Cloudflare MoQ API: publish token not found');
      return { uid: json.result.uid, token: publisher.secret };
    },
    async delete(uid) {
      await call('DELETE', `${base}/${uid}`);
    },
    async list() {
      const res = await call('GET', `${base}?per_page=1000`);
      const json = (await res.json()) as CfEnvelope<
        { uid: string; name: string; created: string }[]
      >;
      return json.result;
    },
  };
}

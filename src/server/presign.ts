import { AwsClient } from 'aws4fetch';

export const MAX_PHOTO_BYTES = 1_048_576;

const PUT_EXPIRES_SEC = 300;
const GET_EXPIRES_SEC = 3600;

export interface Presigner {
  put(key: string, size: number): Promise<string>;
  get(key: string): Promise<string>;
}

export function createPresigner(o: {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Presigner {
  const client = new AwsClient({
    accessKeyId: o.accessKeyId,
    secretAccessKey: o.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const base = `https://${o.accountId}.r2.cloudflarestorage.com/${o.bucket}`;

  async function sign(
    key: string,
    method: 'PUT' | 'GET',
    expires: number,
    headers?: Record<string, string>,
  ): Promise<string> {
    const url = new URL(`${base}/${key}`);
    url.searchParams.set('X-Amz-Expires', String(expires));
    // allHeaders: aws4fetch は既定で content-type / content-length を署名対象から外すため明示する。
    const signed = await client.sign(url.toString(), {
      method,
      headers,
      aws: { signQuery: true, allHeaders: true },
    });
    return signed.url;
  }

  return {
    // Content-Length を署名に含めるので、宣言と違うサイズの PUT は R2 が 403 にする。
    put: (key, size) =>
      sign(key, 'PUT', PUT_EXPIRES_SEC, {
        'content-type': 'image/jpeg',
        'content-length': String(size),
      }),
    get: (key) => sign(key, 'GET', GET_EXPIRES_SEC),
  };
}

export function photoKey(p: {
  code: string;
  gameId: string;
  round: number;
  pid: string;
  rand: string;
}): string {
  return `rooms/${p.code}/${p.gameId}/${p.round}/${p.pid}-${p.rand}.jpg`;
}

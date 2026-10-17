import { MAX_PHOTO_BYTES, parsePhotoKey, photoKey } from '../presign';
import type { Presigner } from '../presign';
import { authorize, checkCode } from './rooms';
import type { RoomDeps } from './rooms';

export interface PhotoDeps {
  presigner: Presigner;
  storage: Pick<R2Bucket, 'list' | 'get'>;
  store: RoomDeps['store'];
  hmacSecret: string;
  now: () => number;
  /** 16 桁の小文字 16 進数の乱数（'-' を含まないこと。parsePhotoKey が前提にする）。 */
  rand: () => string;
}

const GAME_ID = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_ROUND = 10;

function checkRound(input: { gameId: string; round: number }): void {
  if (!GAME_ID.test(input.gameId)) throw new RangeError('invalid gameId');
  if (!Number.isInteger(input.round) || input.round < 1 || input.round > MAX_ROUND) {
    throw new RangeError(`round must be an integer in 1-${MAX_ROUND}`);
  }
}

export async function requestUpload(
  d: PhotoDeps,
  token: string,
  code: string,
  input: { gameId: string; round: number; size: number },
): Promise<{ key: string; url: string }> {
  checkCode(code);
  checkRound(input);
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > MAX_PHOTO_BYTES) {
    throw new RangeError(`size must be an integer in 1-${MAX_PHOTO_BYTES}`);
  }
  const { payload } = await authorize(d, token, 'any', code);
  const key = photoKey({
    code,
    gameId: input.gameId,
    round: input.round,
    pid: payload.pid,
    rand: d.rand(),
  });
  return { key, url: await d.presigner.put(key, input.size) };
}

/** GM だけが、そのラウンドの写真を一覧できる。 */
export async function listRoundPhotos(
  d: PhotoDeps,
  token: string,
  code: string,
  input: { gameId: string; round: number },
): Promise<{ pid: string; key: string; url: string }[]> {
  checkCode(code);
  checkRound(input);
  await authorize(d, token, 'gm', code);
  const prefix = `rooms/${code}/${input.gameId}/${input.round}/`;
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await d.storage.list({ prefix, cursor });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const found = keys.flatMap((key) => {
    const k = parsePhotoKey(key);
    return k ? [{ pid: k.pid, key }] : [];
  });
  return Promise.all(found.map(async (f) => ({ ...f, url: await d.presigner.get(f.key) })));
}

import type { RoundPhoto } from '../api';
import type { GmAction, GmState } from './gmMachine';

// picking に入った GM が、そのラウンドの写真を集めて確かめる：
// 各プレイヤーの写真を取得して SHA-256 を計算し、shutter で申告されたハッシュと比べる。
// 合わなければ photoChecked{valid:false}。全員分の判定を出したら resultsReady で results を送る。

export interface PhotoCheckDeps {
  listPhotos(query: { gameId: string; round: number }): Promise<RoundPhoto[]>;
  /** 写真の中身（取得に失敗したら reject する）。 */
  fetchBytes(url: string): Promise<Uint8Array>;
  sha256Hex(bytes: Uint8Array): Promise<string>;
  dispatch(a: GmAction): void;
  stopped(): boolean;
  sleep(ms: number): Promise<void>;
}

/** 一覧と写真の取得 1 回あたりの待ち時間。応答なしで止まったら失敗として扱う。 */
export const PHOTO_TIMEOUT_MS = 10_000;
const LIST_RETRY_MS = [1000, 2000, 4000];
const FETCH_RETRIES = 2;
const FETCH_RETRY_MS = 1000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), PHOTO_TIMEOUT_MS);
    p.then(resolve, reject).finally(() => clearTimeout(t));
  });
}

/** 一覧を取れるまで（遠のく間隔で）やり直す。止められたら null。 */
async function listUntilDone(s: GmState, d: PhotoCheckDeps): Promise<RoundPhoto[] | null> {
  for (let i = 0; ; i++) {
    try {
      return await withTimeout(d.listPhotos({ gameId: s.gameId!, round: s.round }));
    } catch (e) {
      console.warn('写真の一覧を取れなかった', e);
      await d.sleep(LIST_RETRY_MS[Math.min(i, LIST_RETRY_MS.length - 1)]!);
      if (d.stopped()) return null;
    }
  }
}

async function fetchWithRetry(url: string, d: PhotoCheckDeps): Promise<Uint8Array | null> {
  for (let i = 0; i <= FETCH_RETRIES; i++) {
    try {
      return await withTimeout(d.fetchBytes(url));
    } catch (e) {
      console.warn('写真を取得できなかった', e);
      if (i < FETCH_RETRIES) await d.sleep(FETCH_RETRY_MS);
      if (d.stopped()) return null;
    }
  }
  return null;
}

/** s は picking に入った時点の GM の状態（提出と shutter のハッシュはここで確定している）。 */
export async function checkRoundPhotos(s: GmState, d: PhotoCheckDeps): Promise<void> {
  if (!s.gameId) return;
  const photos = await listUntilDone(s, d);
  if (!photos || d.stopped()) return;

  // 提出のキーと同じ写真だけを使う（同じ人が撮り直しの途中でアップロードした別の写真は無視する）。
  const submitted = Object.entries(s.submissions).flatMap(([pid, sub]) => {
    const photo = photos.find((p) => p.pid === pid && p.key === sub.key);
    return photo ? [{ pid, url: photo.url }] : [];
  });

  await Promise.all(
    submitted.map(async ({ pid, url }) => {
      const bytes = await fetchWithRetry(url, d);
      if (d.stopped()) return;
      // 取得できない写真は見せられないので無効にする。
      const valid = bytes !== null && (await d.sha256Hex(bytes)) === s.shutters[pid]?.hash;
      if (d.stopped()) return;
      d.dispatch({ type: 'photoChecked', pid, valid });
    }),
  );
  if (d.stopped()) return;

  const gmPhoto = photos.find((p) => p.key === s.gmPhotoKey) ?? photos.find((p) => p.pid === s.gmPid);
  d.dispatch({ type: 'resultsReady', gmPhotoUrl: gmPhoto?.url ?? '', photos: submitted });
}

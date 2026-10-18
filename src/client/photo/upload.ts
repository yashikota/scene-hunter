export interface UploadApi {
  requestUpload(input: {
    gameId: string;
    round: number;
    size: number;
  }): Promise<{ key: string; url: string }>;
}

async function put(url: string, blob: Blob): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: blob,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 写真を保管先へ PUT してキーを返す。PUT が失敗したら URL を取り直して 1 回だけやり直す。 */
export async function uploadPhoto(
  api: UploadApi,
  blob: Blob,
  meta: { gameId: string; round: number },
): Promise<string> {
  const ask = () => api.requestUpload({ ...meta, size: blob.size });
  const first = await ask();
  if (await put(first.url, blob)) return first.key;
  const second = await ask();
  if (await put(second.url, blob)) return second.key;
  throw new Error("photo upload failed");
}

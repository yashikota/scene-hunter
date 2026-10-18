/** 写真を画面に出すための object URL。作れない環境（テストなど）では undefined にする。 */
export function objectUrl(blob: Blob): string | undefined {
  try {
    return URL.createObjectURL(blob);
  } catch {
    return undefined;
  }
}

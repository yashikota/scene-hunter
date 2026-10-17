export type Limiter = { limit(o: { key: string }): Promise<{ success: boolean }> };

/** Rate Limiting binding に 1 回分を数えさせ、上限内なら true を返す。 */
export async function allow(l: Limiter, key: string): Promise<boolean> {
  const { success } = await l.limit({ key });
  return success;
}

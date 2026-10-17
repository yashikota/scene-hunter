import { expect, test } from '@playwright/test';

// 番号の打ち間違い：無い部屋の番号は、名前を聞く前に 10 秒以内で「見つかりません」と知らせる。

test('無い部屋の番号を入れると、10 秒以内に「部屋が見つかりません」と出る', async ({ page }) => {
  await page.goto('/');
  // 6 桁でない番号は、サーバーに聞かずにその場で知らせる
  await page.getByPlaceholder('部屋の番号').fill('123');
  await page.getByRole('button', { name: '部屋に入る' }).click();
  await expect(page.getByRole('alert')).toHaveText('6 桁の番号を入れてください');

  // 000000 は作られることがまず無い番号（部屋の番号は乱数の 6 桁）
  await page.getByPlaceholder('部屋の番号').fill('000000');
  const started = Date.now();
  await page.getByRole('button', { name: '部屋に入る' }).click();
  await expect(page.getByRole('alert')).toHaveText('部屋が見つかりません。番号を確かめてください', {
    timeout: 10_000,
  });
  expect(Date.now() - started).toBeLessThan(10_000);
  // 名前の入力には進まない
  await expect(page.getByPlaceholder('名前')).toHaveCount(0);
});

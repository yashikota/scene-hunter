import { expect, test } from '@playwright/test';
import {
  closeAll,
  createRoom,
  expectLobbyCount,
  joinByCode,
  joinByLink,
  newPerson,
} from './helpers';

// ロビーでの出入りと GM の交代。

test('再読み込みしても同じプレイヤーで戻り、部屋を出た人は番号で入り直せる', async ({
  browser,
}) => {
  const gm = await newPerson(browser, 'ジーエム');
  const alice = await newPerson(browser, 'アリス');
  const bob = await newPerson(browser, 'ボブ');
  try {
    const code = await createRoom(gm);
    await joinByCode(alice, code);
    await joinByLink(bob, code);
    await expectLobbyCount(gm, 3);

    // 再読み込み：保存した資格で同じ pid のまま戻る（参加者は増えない）
    await alice.page.reload();
    await expect(alice.page.getByText('GM の開始を待っています')).toBeVisible();
    await expect(alice.page.getByText('アリス（あなた）')).toBeVisible();
    await expectLobbyCount(gm, 3);

    // 部屋を出るとトップに戻る
    await bob.page.getByRole('button', { name: '部屋を出る' }).click();
    await expect(bob.page.getByRole('button', { name: '部屋を作る' })).toBeVisible();
    await expect(bob.page).toHaveURL(/\/$/);

    // 番号で入り直すと、新しいプレイヤーとしてロビーに戻る。
    // 出たことを GM に知らせるイベントは無いので、GM の一覧には前の分も残る（4 人になる）。
    await joinByCode(bob, code);
    await expectLobbyCount(gm, 4);
    await expect(bob.page.getByText(/ボブ.*（あなた）/)).toBeVisible();
  } finally {
    await closeAll([gm, alice, bob]);
  }
});

test('ロビーで GM を渡すと、渡した先が GM になり、前の GM はプレイヤーとして入り直す', async ({
  browser,
}) => {
  const gm = await newPerson(browser, 'ジーエム');
  const alice = await newPerson(browser, 'アリス');
  const bob = await newPerson(browser, 'ボブ');
  try {
    const code = await createRoom(gm);
    await joinByCode(alice, code);
    await joinByCode(bob, code);
    await expectLobbyCount(gm, 3);

    await gm.page.getByRole('button', { name: 'GM を交代' }).click();
    const sheet = gm.page.getByRole('dialog', { name: '誰に GM を渡しますか' });
    await sheet.getByRole('button', { name: 'アリス' }).click();

    // アリスが GM になる
    await expect(alice.page.getByText('あなたが GM')).toBeVisible({ timeout: 30_000 });
    await expect(alice.page.getByText('アリス（GM）')).toBeVisible();
    // 前の GM はプレイヤーとして入り直す
    await expect(gm.page.getByText('GM の開始を待っています')).toBeVisible({ timeout: 30_000 });
    // ほかのプレイヤーも新しい GM に従う（GM が始めると、新しい GM の撮影待ちになる）
    await expect(alice.page.locator('.sh-tile', { hasText: 'ジーエム' })).toBeVisible();
    await alice.page.getByRole('button', { name: 'ゲームを始める' }).click();
    await expect(alice.page.getByRole('button', { name: 'この場で撮影する' })).toBeVisible();
    for (const p of [gm, bob]) {
      await expect(p.page.getByText(/アリスさんが\s*お題を撮影中/)).toBeVisible();
    }
  } finally {
    await closeAll([gm, alice, bob]);
  }
});

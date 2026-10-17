import { expect, test } from '@playwright/test';
import {
  closeAll,
  createRoom,
  expectLobbyCount,
  joinByCode,
  joinByLink,
  newPerson,
  type Person,
} from './helpers';

// 1 ゲーム（3 ラウンド）を最後まで遊ぶ。GM と 2 人のプレイヤーがそれぞれ別のブラウザで、
// 手元の moq-relay を通してやり取りする。全員が提出するとターンは時間を待たずに終わる。

const ROUNDS = 3;

test('部屋を作り、番号とリンクで 2 人が入り、3 ラウンド遊んで最終結果まで進む', async ({
  browser,
}) => {
  const gm = await newPerson(browser, 'ジーエム');
  const alice = await newPerson(browser, 'アリス');
  const bob = await newPerson(browser, 'ボブ');
  const players = [alice, bob];
  try {
    const code = await createRoom(gm);
    await joinByCode(alice, code);
    await joinByLink(bob, code);
    await expectLobbyCount(gm, 3);

    await gm.page.getByRole('button', { name: 'ゲームを始める' }).click();

    for (let round = 1; round <= ROUNDS; round++) {
      await playRound(gm, players, round);
    }

    // 最終結果：全員に順位が出る
    for (const p of [gm, ...players]) {
      await expect(p.page.getByRole('heading', { name: '最終結果' })).toBeVisible();
      await expect(p.page.getByLabel('1 位').first()).toBeVisible();
    }
    // GM はロビーに戻せる
    await expect(gm.page.getByRole('button', { name: 'ロビーに戻る' })).toBeVisible();
    await expect(alice.page.getByText('GM がロビーに戻すのを待っています')).toBeVisible();
  } finally {
    await closeAll([gm, ...players]);
  }
});

async function playRound(gm: Person, players: Person[], round: number): Promise<void> {
  const label = `ROUND ${round} / ${ROUNDS}`;
  // GM：偽のカメラでお題を撮る
  await expect(gm.page.getByText(label)).toBeVisible();
  const shoot = gm.page.getByRole('button', { name: 'この場で撮影する' });
  await expect(shoot).toBeEnabled();
  await shoot.click();

  // プレイヤー：ヒント（e2e の決まった文）が出て、撮影して提出する
  for (const p of players) {
    await expect(p.page.getByText('e2e hint 1', { exact: false })).toBeVisible();
    const shutter = p.page.getByRole('button', { name: '撮影して提出' });
    await expect(shutter).toBeEnabled();
    await shutter.click();
    // 最後の 1 人は「提出しました」を飛ばして写真の一覧に進むので、撮影の画面を離れたことだけを確かめる
    await expect(shutter).toBeHidden();
  }
  // 全員が出したので、プレイヤーは GM が選ぶのを待つ
  for (const p of players) await expect(p.page.getByText('みんなの写真')).toBeVisible();

  // GM：全員が出したので時間を待たずに選ぶ画面へ。上位を選んで決定する
  await expect(gm.page.getByText('お題に近い順に 3 枚選ぶ')).toBeVisible();
  const photos = gm.page.locator('button[aria-pressed]');
  await expect(photos).toHaveCount(players.length);
  // 写真のハッシュが shutter のときと合う（保管先への PUT と GET を通った）ので、どれも有効
  for (let i = 0; i < players.length; i++) await expect(photos.nth(i)).toBeEnabled();
  await expect(gm.page.getByText('無効')).toHaveCount(0);
  for (let i = 0; i < players.length; i++) await photos.nth(i).click();
  await gm.page.getByRole('button', { name: '決定する' }).click();

  // 結果：全員にラウンドの結果が出る
  for (const p of [gm, ...players]) {
    await expect(p.page.getByText(`ラウンド ${round} の結果`)).toBeVisible();
  }
  await gm.page
    .getByRole('button', { name: round === ROUNDS ? '最終結果へ' : '次のラウンドへ' })
    .click();
}

test('ゲームの途中でタブを閉じた人は待たず、残りの全員が出せばターンは時間前に終わる', async ({
  browser,
}) => {
  const gm = await newPerson(browser, 'ジーエム');
  const alice = await newPerson(browser, 'アリス');
  const bob = await newPerson(browser, 'ボブ');
  const carol = await newPerson(browser, 'キャロル');
  const players = [alice, bob];
  try {
    const code = await createRoom(gm);
    for (const p of [alice, bob, carol]) await joinByCode(p, code);
    await expectLobbyCount(gm, 4);
    await gm.page.getByRole('button', { name: 'ゲームを始める' }).click();

    const shoot = gm.page.getByRole('button', { name: 'この場で撮影する' });
    await expect(shoot).toBeEnabled();
    await shoot.click();
    await expect(carol.page.getByText('e2e hint 1', { exact: false })).toBeVisible();
    const turnStart = Date.now();

    // キャロルはプレイヤーのターンの途中でタブを閉じる
    await carol.page.close({ runBeforeUnload: true });

    for (const p of players) {
      const shutter = p.page.getByRole('button', { name: '撮影して提出' });
      await expect(shutter).toBeEnabled();
      await shutter.click();
      await expect(shutter).toBeHidden();
    }
    // GM の一覧ではキャロルが「通信なし」になり、残りの 2 人が出したので時間（60 秒）を待たずに選ぶ画面へ
    await expect(gm.page.getByText('お題に近い順に 3 枚選ぶ')).toBeVisible({ timeout: 40_000 });
    expect(Date.now() - turnStart).toBeLessThan(55_000);
    await expect(gm.page.locator('button[aria-pressed]')).toHaveCount(players.length);
    // 出さなかった人の枠にもキャロルは出ない
    await expect(gm.page.getByText('キャロル')).toHaveCount(0);
    for (const p of players) await expect(p.page.getByText('みんなの写真')).toBeVisible();
  } finally {
    await closeAll([gm, alice, bob, carol]);
  }
});

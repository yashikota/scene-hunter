import { expect, test, type Page } from "@playwright/test";
import {
  closeAll,
  createRoom,
  expectLobbyCount,
  gmShoot,
  joinByCode,
  joinByLink,
  newPerson,
  playerSubmit,
  type Person,
} from "../e2e/helpers";

// 本番で 1 ゲーム（3 ラウンド）を最後まで遊ぶ。tests/e2e/game.spec.ts と同じ流れだが、ヒントは本物の AI が作るので
// 文言は決まっておらず、届くまでの時間もばらつく。

const ROUNDS = 3;
const HINT_TIMEOUT = 240_000;

test("本番：部屋を作り、2 人が入り、3 ラウンド遊んで最終結果まで進む", async ({ browser }) => {
  const gm = await newPerson(browser, "ジーエム");
  const alice = await newPerson(browser, "アリス");
  const bob = await newPerson(browser, "ボブ");
  const players = [alice, bob];
  try {
    const code = await createRoom(gm);
    await joinByCode(alice, code);
    await joinByLink(bob, code);
    await expectLobbyCount(gm, 3);

    await gm.page.getByRole("button", { name: "ゲームを始める" }).click();

    for (let round = 1; round <= ROUNDS; round++) {
      await playRound(gm, players, round);
    }

    for (const p of [gm, ...players]) {
      await expect(p.page.getByRole("heading", { name: "最終結果" })).toBeVisible();
      await expect(p.page.getByLabel("1 位").first()).toBeVisible();
    }
  } finally {
    await closeAll([gm, ...players]);
  }
});

/** 1 つ目のヒントが公開されるまで待つ。GM に「ヒントを作れませんでした」が出たら、やり直しを押す。 */
async function waitFirstHint(gm: Page, player: Page): Promise<string> {
  const hint = player.locator(".sh-hint:not(.sh-hint--locked)").first();
  const retry = gm.getByRole("button", { name: "もう一度試す" });
  const deadline = Date.now() + HINT_TIMEOUT;
  while (Date.now() < deadline) {
    if (await hint.isVisible()) return (await hint.innerText()).trim();
    if (await retry.isVisible()) {
      console.log("hint generation failed; retrying");
      await retry.click();
    }
    await player.waitForTimeout(1_000);
  }
  throw new Error("no hint within timeout");
}

async function playRound(gm: Person, players: Person[], round: number): Promise<void> {
  await expect(gm.page.getByText(`ROUND ${round} / ${ROUNDS}`)).toBeVisible();
  const shotAt = Date.now();
  await gmShoot(gm);

  const first = await waitFirstHint(gm.page, players[0].page);
  console.log(`round ${round}: first hint after ${Date.now() - shotAt} ms: ${first}`);

  for (const p of players) {
    await expect(p.page.locator(".sh-hint:not(.sh-hint--locked)").first()).toBeVisible();
    await playerSubmit(p);
  }
  for (const p of players) await expect(p.page.getByText("みんなの写真")).toBeVisible();

  await expect(gm.page.getByText("お題に近い順に 3 枚選ぶ")).toBeVisible();
  const photos = gm.page.locator("button[aria-pressed]");
  await expect(photos).toHaveCount(players.length);
  // R2 への PUT と GET を通り、shutter のハッシュと合うので、どれも有効
  for (let i = 0; i < players.length; i++) await expect(photos.nth(i)).toBeEnabled();
  await expect(gm.page.getByText("無効")).toHaveCount(0);
  for (let i = 0; i < players.length; i++) await photos.nth(i).click();
  await gm.page.getByRole("button", { name: "決定する" }).click();

  for (const p of [gm, ...players]) {
    await expect(p.page.getByText(`ラウンド ${round} の結果`)).toBeVisible();
  }
  await gm.page
    .getByRole("button", { name: round === ROUNDS ? "最終結果へ" : "次のラウンドへ" })
    .click();
}

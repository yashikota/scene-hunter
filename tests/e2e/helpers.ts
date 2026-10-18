import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

// e2e テストの共通の操作。1 人 = 1 つのブラウザコンテキスト（鍵と sessionStorage を分ける）。

export interface Person {
  name: string;
  context: BrowserContext;
  page: Page;
}

export async function newPerson(browser: Browser, name: string): Promise<Person> {
  const context = await browser.newContext({ locale: "ja-JP", permissions: ["camera"] });
  const page = await context.newPage();
  return { name, context, page };
}

export async function closeAll(people: Person[]): Promise<void> {
  await Promise.all(people.map((p) => p.context.close().catch(() => {})));
}

/** 部屋の番号を URL（/r/{code}）から取り出す。 */
export function roomCode(page: Page): string {
  const m = /\/r\/(\d{6})/.exec(page.url());
  if (!m) throw new Error(`not in a room: ${page.url()}`);
  return m[1];
}

/** トップから部屋を作り、GM のロビーまで進む。部屋の番号を返す。 */
export async function createRoom(gm: Person): Promise<string> {
  const { page } = gm;
  await page.goto("/");
  await page.getByRole("button", { name: "部屋を作る" }).click();
  await page.getByPlaceholder("名前").fill(gm.name);
  await page.getByRole("button", { name: "部屋を作る" }).click();
  await expect(page.getByText("あなたが GM")).toBeVisible();
  await page.waitForURL(/\/r\/\d{6}$/);
  return roomCode(page);
}

/** 名前の入力からプレイヤーのロビーまで進む（番号は確かめ済みであること）。 */
async function enterName(p: Person): Promise<void> {
  await p.page.getByPlaceholder("名前").fill(p.name);
  await p.page.getByRole("button", { name: "部屋に入る" }).click();
  await expect(p.page.getByText("GM の開始を待っています")).toBeVisible();
}

/** トップで番号を打って入る。 */
export async function joinByCode(p: Person, code: string): Promise<void> {
  await p.page.goto("/");
  await p.page.getByPlaceholder("部屋の番号").fill(code);
  await p.page.getByRole("button", { name: "部屋に入る" }).click();
  await enterName(p);
}

/** 共有リンク（/r/{code}）から入る。番号の確かめは自動で進む。 */
export async function joinByLink(p: Person, code: string): Promise<void> {
  await p.page.goto(`/r/${code}`);
  await enterName(p);
}

/** GM のロビーの参加者の人数（GM を含む）が n になるまで待つ。 */
export async function expectLobbyCount(gm: Person, n: number): Promise<void> {
  await expect(gm.page.getByText(`${n} 人`, { exact: true })).toBeVisible();
}

/** GM：偽のカメラでお題を撮り、確かめてお題にする。 */
export async function gmShoot(gm: Person): Promise<void> {
  const shoot = gm.page.getByRole("button", { name: "この場で撮影する" });
  await expect(shoot).toBeEnabled();
  await shoot.click();
  await gm.page.getByRole("button", { name: "この写真をお題にする" }).click();
}

/** プレイヤー：撮って、確かめて提出する。撮影の画面を離れるまで待つ。 */
export async function playerSubmit(p: Person): Promise<void> {
  const shutter = p.page.getByRole("button", { name: "撮影する", exact: true });
  await expect(shutter).toBeEnabled();
  await shutter.click();
  const submit = p.page.getByRole("button", { name: "この写真で提出" });
  await submit.click();
  // 最後の 1 人は「提出しました」を飛ばして写真の一覧に進むので、確認の画面を離れたことだけを確かめる
  await expect(submit).toBeHidden();
}

import { expect, test } from "@playwright/test";
import { closeAll, newPerson, joinByLink, expectLobbyCount, roomCode } from "./helpers";

test("PC は管理者、役割ボタンで切り替え、GM 指定後も再び GM になれる", async ({ browser }) => {
  const admin = await newPerson(browser, "PC");
  const phone = await newPerson(browser, "スマホ");
  try {
    await admin.page.goto("/new");
    await admin.page.getByPlaceholder("名前").fill(admin.name);
    await admin.page.getByRole("button", { name: "部屋を作る" }).click();
    const adminButton = admin.page.getByRole("button", {
      name: "管理者になる（ゲーム参加不可）",
      exact: true,
    });
    const gmButton = admin.page.getByRole("button", { name: "ゲームマスターになる", exact: true });
    await expect(adminButton).toHaveAttribute("aria-pressed", "true");
    await expect(adminButton).toBeDisabled();
    await expect(gmButton).toBeEnabled();
    await expectLobbyCount(admin, 0);
    await gmButton.click();
    await expect(gmButton).toHaveAttribute("aria-pressed", "true");
    await expect(gmButton).toBeDisabled();
    await expect(adminButton).toBeEnabled();
    await expectLobbyCount(admin, 1);
    await adminButton.click();
    await expect(adminButton).toHaveAttribute("aria-pressed", "true");
    await admin.page.reload();
    await expect(adminButton).toHaveAttribute("aria-pressed", "true");
    const code = roomCode(admin.page);
    await joinByLink(phone, code);
    await expectLobbyCount(admin, 1);
    await expectLobbyCount(phone, 1);
    // 他の参加者が接続した状態でも、役割変更で配信を切らない。
    const errors: string[] = [];
    await phone.page.exposeFunction("recordDisconnect", () => errors.push("disconnected"));
    await phone.page.evaluate(() => {
      new MutationObserver(() => {
        if (document.body.innerText.includes("GM との接続が")) {
          (window as unknown as { recordDisconnect(): void }).recordDisconnect();
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await gmButton.click();
    await expectLobbyCount(phone, 2);
    await adminButton.click();
    await expectLobbyCount(phone, 1);
    expect(errors).toEqual([]);

    await admin.page.getByRole("button", { name: "ゲームマスターを選ぶ", exact: true }).click();
    const dialog = admin.page.getByRole("dialog");
    await dialog.getByRole("radio", { name: phone.name, exact: true }).check();
    await dialog.getByRole("button", { name: phone.name + " に GM を渡す", exact: true }).click();
    await expect(phone.page.getByText("あなたが GM", { exact: true })).toBeVisible({
      timeout: 90000,
    });
    await expect(admin.page.getByRole("heading", { name: "管理者", exact: true })).toBeVisible();
    await admin.page.getByRole("button", { name: "ゲームマスターになる", exact: true }).click();
    await expect(admin.page.getByText("あなたが GM", { exact: true })).toBeVisible({
      timeout: 90000,
    });
    await expect(phone.page.getByText("GM の開始を待っています", { exact: true })).toBeVisible({
      timeout: 90000,
    });
    await expectLobbyCount(admin, 2);
  } finally {
    await closeAll([admin, phone]);
  }
});

test("スマホ UA は GM が初期選択になる", async ({ browser }) => {
  const context = await browser.newContext({
    locale: "ja-JP",
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  try {
    await page.goto("/new");
    await page.getByPlaceholder("名前").fill("phone");
    await page.getByRole("button", { name: "部屋を作る" }).click();
    await expect(
      page.getByRole("button", { name: "ゲームマスターになる", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("1 人", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

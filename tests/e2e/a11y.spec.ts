import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

// アクセシビリティの機械の点検：開発用の画面の一覧（/__screens）の全画面と紹介のページに axe-core をかける。
// 色の対比、名前の無いボタン、見出しの順、ランドマークなど、WCAG 2.2 AA の規則で見つかるものを落とす。
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

const SCREENS = [
  "top",
  "name-join",
  "name-create",
  "unsupported",
  "connecting",
  "claim-failed",
  "lobby-gm-empty",
  "lobby-gm",
  "lobby-player",
  "gm-turn",
  "gm-turn-player",
  "hint-wait",
  "hint-error",
  "player-turn",
  "player-turn-gm",
  "player-submitted",
  "results-pick-checking",
  "results-pick",
  "results-pick-none",
  "results-wait",
  "results-wait-collecting",
  "results-reveal",
  "results-reveal-gm",
  "final",
  "final-gm",
  "disconnected",
  "dissolved",
  "camera-denied",
];

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[]; failureSummary?: string }[];
}

async function audit(page: Page): Promise<string[]> {
  // 出てくる途中の動き（透明から濃くなる途中）で色の対比を測らないよう、動きを止めてから測る
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addScriptTag({ path: AXE });
  await page.waitForTimeout(400);
  const violations = await page.evaluate(async () => {
    // @ts-expect-error axe は addScriptTag で window に入る
    const r = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
      },
    });
    return r.violations as Violation[];
  });
  return violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id} (${v.impact}) ${n.target.join(" ")}: ${v.help}`),
  );
}

for (const screen of SCREENS) {
  test(`a11y: ${screen}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/__screens?screen=${screen}&lang=ja`);
    await page.locator("main, [role=dialog]").first().waitFor();
    expect(await audit(page)).toEqual([]);
  });
}

test("a11y: 紹介のページ", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lp");
  await page.locator("main").first().waitFor();
  expect(await audit(page)).toEqual([]);
});

test("a11y: 遊び方のシートは、キーボードだけで開いて送って閉じられる", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/__screens?screen=lobby-player&lang=ja");
  const open = page.getByRole("button", { name: "遊び方" });
  await open.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "遊び方" });
  await expect(dialog).toBeVisible();
  // 開いたらフォーカスはシートの中へ移り、後ろの画面は操作できない
  await expect(dialog.getByRole("button", { name: "次へ" })).toBeFocused();
  await expect(page.locator("#root")).toHaveJSProperty("inert", true);
  expect(await audit(page)).toEqual([]);

  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("2 / 7:", { exact: false })).toBeAttached();

  // Esc で閉じ、開いたボタンへフォーカスが戻る
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  await expect(page.locator("#root")).toHaveJSProperty("inert", false);
});

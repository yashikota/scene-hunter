// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { m } from "../../src/client/paraglide/messages";
import { routeTree } from "../../src/client/routeTree.gen";

afterEach(cleanup);

const open = async () => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/lp"] }),
  });
  render(<RouterProvider router={router} />);
  // ページはブラウザの言語に切り替えるので、文言は描いたあとに引く
  await screen.findByRole("slider");
  return router;
};

describe("紹介のページ（/lp）", () => {
  beforeEach(() => vi.stubGlobal("WebTransport", class {}));

  it("遊び方の 7 つのステップを、ルールの文と並べて出す", async () => {
    await open();
    for (const title of [m.lp_step_1(), m.lp_step_4(), m.lp_step_7()]) {
      expect(screen.getByRole("heading", { name: new RegExp(`${title}$`) })).toBeTruthy();
    }
    expect(screen.getByText(m.rules_3({ sec: 60 }))).toBeTruthy();
    expect(screen.getByText(m.rules_7({ rounds: 3 }))).toBeTruthy();
  });

  it("提出までの秒数を動かすと、ゲームと同じ式で点が変わる", async () => {
    await open();
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "0" } });
    expect(screen.getByText("1,000")).toBeTruthy();
    expect(screen.getByText("×1.00")).toBeTruthy();
    // 時間ぎりぎりで半分
    fireEvent.change(slider, { target: { value: "60" } });
    expect(screen.getByText("500")).toBeTruthy();
    expect(screen.getByText("350")).toBeTruthy();
    expect(screen.getByText("200")).toBeTruthy();
  });

  it("「今すぐ遊ぶ」でトップへ進む", async () => {
    const router = await open();
    const [cta] = screen.getAllByRole("link", { name: m.lp_cta() });
    fireEvent.click(cta!);
    await screen.findByRole("button", { name: m.create_button() });
    expect(router.state.location.pathname).toBe("/");
  });
});

// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { m } from "../../src/client/paraglide/messages";
import { EditableName } from "../../src/client/screens/Rename";
import { Screen } from "../../src/client/ui/Screen";
import { Sheet } from "../../src/client/ui/Sheet";

afterEach(cleanup);

function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <Sheet open={open} title="確かめ" onCancel={() => setOpen(false)}>
        <button type="button">inside</button>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("開くと中へフォーカスを移して後ろを inert にし、Esc で閉じて開いたボタンへ戻す", async () => {
    const { container } = render(<SheetDemo />);
    const opener = screen.getByRole("button", { name: "open" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "確かめ" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    // 後ろの画面（render の入れ物）は操作できない。シートは body の直下にある
    expect((container as HTMLElement).inert).toBe(true);
    expect(container.contains(dialog)).toBe(false);

    fireEvent.keyDown(document, { key: "Escape" });
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((container as HTMLElement).inert).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});

describe("Screen", () => {
  it("フォーカスが消えていたら、新しい画面の h1 へ移す。title は見えない h1 になる", () => {
    (document.activeElement as HTMLElement | null)?.blur();
    render(<Screen title="部屋 482913">本文</Screen>);
    const h1 = screen.getByRole("heading", { level: 1, name: "部屋 482913" });
    expect(document.activeElement).toBe(h1);
  });

  it("入力欄などにフォーカスがあるときは動かさない", () => {
    render(<input aria-label="keep" />);
    const input = screen.getByRole("textbox", { name: "keep" });
    input.focus();
    render(
      <Screen>
        <h1>見出し</h1>
      </Screen>,
    );
    expect(document.activeElement).toBe(input);
  });
});

describe("EditableName", () => {
  it("書き換えをやめると、鉛筆へフォーカスを戻す。エラーは入力欄に結び付ける", async () => {
    render(<EditableName display="はるか（GM）" name="はるか" onRename={async () => {}} />);
    fireEvent.click(screen.getByRole("button", { name: m.rename_button() }));
    const input = screen.getByRole("textbox", { name: m.name_label() });
    fireEvent.change(input, { target: { value: "  " } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)?.textContent).toBe(m.error_name());

    fireEvent.click(screen.getByRole("button", { name: m.cancel() }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: m.rename_button() }));
  });
});

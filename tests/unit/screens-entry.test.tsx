// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { m } from "../../src/client/paraglide/messages";
import { setLocale } from "../../src/client/paraglide/runtime";
import { Connecting } from "../../src/client/screens/Connecting";
import { LobbyGm } from "../../src/client/screens/LobbyGm";
import { LobbyPlayer } from "../../src/client/screens/LobbyPlayer";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "../../src/client/routeTree.gen";
import { NameStep } from "../../src/client/screens/NameStep";
import { Top } from "../../src/client/screens/Top";
import { LOCALE_NAMES, LOCALES } from "../../src/shared/locales";

const setLanguages = (langs: string[]) =>
  Object.defineProperty(window.navigator, "languages", { value: langs, configurable: true });

const players = [
  { pid: "a", label: "はるか" },
  { pid: "b", label: "はるか (2)" },
  { pid: "c", label: "そうた" },
];

const lobbyGm = (over: Partial<Parameters<typeof LobbyGm>[0]> = {}) => (
  <LobbyGm
    code="482913"
    gmName="ゆうき"
    players={players}
    rounds={3}
    limitSec={60}
    onStart={() => {}}
    onTransfer={async () => {}}
    onDissolve={() => {}}
    onRename={async () => {}}
    {...over}
  />
);

beforeEach(() => {
  setLanguages(["ja-JP"]);
  setLocale("ja", { reload: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Top", () => {
  it("WebTransport が無いブラウザでは非対応の画面を出す", () => {
    expect(typeof (globalThis as { WebTransport?: unknown }).WebTransport).toBe("undefined");
    render(<Top onEntered={() => {}} />);
    expect(screen.getByRole("heading", { name: m.unsupported_title() })).toBeTruthy();
    expect(screen.queryByRole("button", { name: m.join_button() })).toBeNull();
  });

  describe("WebTransport があるとき", () => {
    beforeEach(() => vi.stubGlobal("WebTransport", class {}));

    it("言語のプルダウンに 11 言語が LOCALE_NAMES の表記で並び、ブラウザの言語が選ばれている", () => {
      setLanguages(["ko-KR", "en"]);
      render(<Top onEntered={() => {}} />);
      const select = screen.getByRole("combobox") as unknown as HTMLSelectElement;
      expect([...select.options].map((o) => o.textContent)).toEqual(
        LOCALES.map((l) => LOCALE_NAMES[l]),
      );
      expect([...select.options].map((o) => o.value)).toEqual([...LOCALES]);
      expect(select.value).toBe("ko");
      // 画面の文言もその言語になる
      expect(screen.getByRole("button", { name: "방에 들어가기" })).toBeTruthy();
    });

    it("選び直した言語を覚え、次に開いたときはブラウザの言語より優先する", () => {
      setLanguages(["ko-KR"]);
      const { unmount } = render(<Top onEntered={() => {}} />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "de" } });
      expect(localStorage.getItem("sh:locale")).toBe("de");
      unmount();
      render(<Top onEntered={() => {}} />);
      expect((screen.getByRole("combobox") as unknown as HTMLSelectElement).value).toBe("de");
      expect(document.documentElement.lang).toBe("de");
    });

    it("覚えた言語が壊れていたら、ブラウザの言語で出す", () => {
      setLanguages(["ko-KR"]);
      localStorage.setItem("sh:locale", "xx");
      render(<Top onEntered={() => {}} />);
      expect((screen.getByRole("combobox") as unknown as HTMLSelectElement).value).toBe("ko");
    });

    it("トップには名前の入力が無い", () => {
      render(<Top onEntered={() => {}} />);
      expect(screen.queryByLabelText(m.name_label())).toBeNull();
      expect(screen.getByLabelText(m.code_label())).toBeTruthy();
    });

    it("部屋を作るを押すと名前を聞き、選んだ言語で部屋を作る", async () => {
      const create = vi.fn(async () => "482913");
      const onEntered = vi.fn();
      render(<Top onEntered={onEntered} deps={{ create, find: vi.fn() }} />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "fr" } });
      fireEvent.click(screen.getByRole("button", { name: m.create_button() }));
      const name = screen.getByLabelText(m.name_label());
      expect(document.activeElement).toBe(name);
      fireEvent.change(name, { target: { value: " はるか " } });
      fireEvent.click(screen.getByRole("button", { name: m.create_button() }));
      await vi.waitFor(() => expect(onEntered).toHaveBeenCalledWith("482913"));
      expect(create).toHaveBeenCalledWith("はるか", "fr");
    });

    it("入るを押すと部屋があるか確かめ、あれば次へ進む（名前は聞かない）", async () => {
      const find = vi.fn(async () => {});
      const onEntered = vi.fn();
      render(<Top onEntered={onEntered} deps={{ create: vi.fn(), find }} />);
      fireEvent.change(screen.getByLabelText(m.code_label()), { target: { value: "482913" } });
      fireEvent.click(screen.getByRole("button", { name: m.join_button() }));
      await vi.waitFor(() => expect(onEntered).toHaveBeenCalledWith("482913"));
      expect(find).toHaveBeenCalledWith("482913");
    });

    it("部屋が無ければ番号を残したまま「見つかりません」を出す", async () => {
      const find = vi.fn(async () => {
        throw Object.assign(new Error("not found"), { status: 404 });
      });
      const onEntered = vi.fn();
      render(<Top onEntered={onEntered} deps={{ create: vi.fn(), find }} />);
      fireEvent.change(screen.getByLabelText(m.code_label()), { target: { value: "482913" } });
      fireEvent.click(screen.getByRole("button", { name: m.join_button() }));
      expect((await screen.findByRole("alert")).textContent).toBe(m.error_not_found());
      expect((screen.getByLabelText(m.code_label()) as HTMLInputElement).value).toBe("482913");
      expect(onEntered).not.toHaveBeenCalled();
    });

    it("確かめている間は全画面の待ちにせず、ボタンを回すだけ。番号を直すと確かめを捨てる", async () => {
      const find = vi.fn(() => new Promise<never>(() => {}));
      const onEntered = vi.fn();
      render(<Top onEntered={onEntered} deps={{ create: vi.fn(), find }} />);
      fireEvent.change(screen.getByLabelText(m.code_label()), { target: { value: "482913" } });
      fireEvent.click(screen.getByRole("button", { name: m.join_button() }));
      const button = screen.getByRole("button", { name: m.join_button() }) as HTMLButtonElement;
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect(button.disabled).toBe(true);
      expect(screen.queryByText(m.preparing_title())).toBeNull();
      fireEvent.change(screen.getByLabelText(m.code_label()), { target: { value: "48291" } });
      expect(button.disabled).toBe(false);
    });

    it("6 桁でない番号では確かめない", () => {
      const find = vi.fn();
      render(<Top onEntered={() => {}} deps={{ create: vi.fn(), find }} />);
      fireEvent.change(screen.getByLabelText(m.code_label()), { target: { value: "4829" } });
      fireEvent.click(screen.getByRole("button", { name: m.join_button() }));
      expect(screen.getByRole("alert").textContent).toBe(m.error_code());
      expect(find).not.toHaveBeenCalled();
    });
  });
});

describe("Top に番号を渡して開く", () => {
  beforeEach(() => vi.stubGlobal("WebTransport", class {}));

  it("Top は initialCode を入れ、すぐに部屋を確かめて次へ進む", async () => {
    const find = vi.fn(async () => {});
    const onEntered = vi.fn();
    render(<Top initialCode="123456" onEntered={onEntered} deps={{ create: vi.fn(), find }} />);
    expect((screen.getByLabelText(m.code_label()) as HTMLInputElement).value).toBe("123456");
    await vi.waitFor(() => expect(onEntered).toHaveBeenCalledWith("123456"));
  });

  it("番号が無いときは空のままで、確かめない", () => {
    const find = vi.fn();
    render(<Top onEntered={() => {}} deps={{ create: vi.fn(), find }} />);
    expect((screen.getByLabelText(m.code_label()) as HTMLInputElement).value).toBe("");
    expect(find).not.toHaveBeenCalled();
  });
});

describe("/r/{code} を直接開く（まだ入っていない部屋）", () => {
  beforeEach(() => vi.stubGlobal("WebTransport", class {}));

  const open = (path: string) => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    render(<RouterProvider router={router} />);
    return router;
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("トップで部屋を確かめ、あれば名前の入力に戻ってくる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ exists: true })),
    );
    const router = open("/r/246810");
    expect(await screen.findByLabelText(m.name_label())).toBeTruthy();
    expect(router.state.location.pathname).toBe("/r/246810");
    expect(screen.getByText("246810")).toBeTruthy();
  });

  it("名前の入力でやめると、この URL のまま番号を入れたトップに戻る（確かめ直さない）", async () => {
    const fetchMock = vi.fn(async () => json({ exists: true }));
    vi.stubGlobal("fetch", fetchMock);
    const router = open("/r/445566");
    await screen.findByLabelText(m.name_label());
    fireEvent.click(screen.getByRole("button", { name: m.cancel() }));
    expect(((await screen.findByLabelText(m.code_label())) as HTMLInputElement).value).toBe(
      "445566",
    );
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(router.state.location.pathname).toBe("/r/445566");
    expect(screen.queryByLabelText(m.name_label())).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("/?code= は使わない（番号は入れず、確かめもしない）", async () => {
    const fetchMock = vi.fn(async () => json({ exists: true }));
    vi.stubGlobal("fetch", fetchMock);
    const router = open("/?code=112233");
    expect(((await screen.findByLabelText(m.code_label())) as HTMLInputElement).value).toBe("");
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(router.state.location.pathname).toBe("/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("6 桁の数字でない /r/{code} はトップに回す", async () => {
    const fetchMock = vi.fn(async () => json({ exists: true }));
    vi.stubGlobal("fetch", fetchMock);
    for (const bad of ["12345", "1234567", "abcdef", "12e456"]) {
      const router = open(`/r/${bad}`);
      await vi.waitFor(() => expect(router.state.location.pathname).toBe("/"));
      cleanup();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("部屋が無ければ、数秒で番号を入れたトップに「見つかりません」を出す（準備中の画面は出さない）", async () => {
    const fetchMock = vi.fn(async () => json({ exists: false }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const router = open("/r/135791");
      await act(() => vi.advanceTimersByTimeAsync(10));
      expect(screen.queryByText(m.preparing_title())).toBeNull();
      // 3 秒おきに 2 回だけ確かめ直す（約 6 秒）
      for (let i = 0; i < 3; i++) await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(router.state.location.pathname).toBe("/r/135791");
      expect(screen.getByRole("alert").textContent).toBe(m.error_not_found());
      expect((screen.getByLabelText(m.code_label()) as HTMLInputElement).value).toBe("135791");
      expect(screen.queryByLabelText(m.name_label())).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("NameStep", () => {
  afterEach(() => localStorage.clear());

  it("名前の欄はパスワードマネージャーに補完も保存もさせない", () => {
    render(<NameStep code="482913" onSubmit={async () => {}} onBack={() => {}} />);
    const input = screen.getByLabelText(m.name_label());
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.hasAttribute("data-1p-ignore")).toBe(true);
    expect(input.getAttribute("data-lpignore")).toBe("true");
  });

  it("前に使った名前を入れておき、決めた名前を覚える", async () => {
    localStorage.setItem("sh:name", "はるか");
    const onSubmit = vi.fn(async () => {});
    render(<NameStep code="482913" onSubmit={onSubmit} onBack={() => {}} />);
    const input = screen.getByLabelText(m.name_label()) as HTMLInputElement;
    expect(input.value).toBe("はるか");
    expect(document.activeElement).toBe(input);
    expect(screen.getByText("482913")).toBeTruthy();
    fireEvent.change(input, { target: { value: " そうた " } });
    fireEvent.click(screen.getByRole("button", { name: m.join_button() }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith("そうた", expect.anything()));
    expect(localStorage.getItem("sh:name")).toBe("そうた");
  });

  it("localStorage が使えなくても空の入力で出す", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<NameStep onSubmit={vi.fn()} onBack={() => {}} />);
    expect((screen.getByLabelText(m.name_label()) as HTMLInputElement).value).toBe("");
    get.mockRestore();
  });

  it("名前が空なら送らず、失敗は文言で出す", async () => {
    const onSubmit = vi.fn(async () => {
      throw Object.assign(new Error("x"), { status: 404 });
    });
    render(<NameStep code="482913" onSubmit={onSubmit} onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: m.join_button() }));
    expect(screen.getByRole("alert").textContent).toBe(m.error_name());
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(m.name_label()), { target: { value: "はるか" } });
    fireEvent.click(screen.getByRole("button", { name: m.join_button() }));
    expect((await screen.findByRole("alert")).textContent).toBe(m.error_not_found());
  });

  it("部屋がまだ見えない間は準備中の画面にする", async () => {
    const onSubmit = vi.fn((_n: string, o: { onWaiting(): void }) => {
      o.onWaiting();
      return new Promise<void>(() => {});
    });
    render(<NameStep code="482913" onSubmit={onSubmit} onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText(m.name_label()), { target: { value: "はるか" } });
    fireEvent.click(screen.getByRole("button", { name: m.join_button() }));
    expect(await screen.findByRole("heading", { name: m.preparing_title() })).toBeTruthy();
  });
});

describe("Connecting", () => {
  it("部屋を準備中なら「部屋を準備しています」", () => {
    render(<Connecting preparing />);
    expect(screen.getByRole("heading", { name: "部屋を準備しています" })).toBeTruthy();
  });

  it("待ちの画面は題だけで、説明の文を出さない", () => {
    for (const kind of ["connecting", "preparing", "claiming", "rejoining"] as const) {
      const { container, unmount } = render(<Connecting kind={kind} />);
      expect(container.querySelector("p")).toBeNull();
      unmount();
    }
  });
});

describe("LobbyGm", () => {
  it("GM の印、参加者の label、3 ラウンドと 60 秒の固定表示があり、設定を変える操作は無い", () => {
    render(lobbyGm());
    expect(screen.getByText(m.you_are_gm())).toBeTruthy();
    expect(screen.getByText("ゆうき（GM）")).toBeTruthy();
    for (const p of players) expect(screen.getByText(p.label)).toBeTruthy();
    expect(screen.getByText("4 人")).toBeTruthy(); // GM を含める
    // 設定の枠ではなく、1 行の固定表示
    expect(screen.getByText("3 ラウンド · 60 秒")).toBeTruthy();
    // 参加者がいれば、ゲーム中に画面を閉じないよう 1 行だけ伝える
    expect(screen.getByText("画面を閉じないでね")).toBeTruthy();
    expect(screen.queryByText(m.start_waiting())).toBeNull();
    // ボタンは番号とリンクのコピー、自分の名前の鉛筆、遊び方、開始、交代、解散だけで、ラウンド数と制限時間を変える入力も無い
    expect(
      screen.getAllByRole("button").map((b) => b.textContent || b.getAttribute("aria-label")),
    ).toEqual([
      "482913",
      m.copy_link(),
      m.rename_button(),
      m.rules_button(),
      m.start_button(),
      m.transfer_button(),
      m.dissolve_button(),
    ]);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("参加者がいなければ開始できない", () => {
    render(lobbyGm({ players: [] }));
    expect(screen.getByText(m.start_waiting())).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: m.start_button() }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("GM の交代は参加者を選んで渡す", async () => {
    const onTransfer = vi.fn(async () => {});
    render(lobbyGm({ onTransfer }));
    fireEvent.click(screen.getByRole("button", { name: m.transfer_button() }));
    const dialog = screen.getByRole("dialog", { name: m.transfer_title() });
    fireEvent.click(within(dialog).getByRole("button", { name: "そうた" }));
    await vi.waitFor(() => expect(onTransfer).toHaveBeenCalledWith("c"));
  });

  it("setLocale('en') で描くと英語の文言になる", () => {
    setLocale("en", { reload: false });
    render(lobbyGm());
    expect(screen.getByText("You are the GM")).toBeTruthy();
    expect(screen.getByText("4 players")).toBeTruthy();
    expect(screen.getByText("3 rounds · 60 sec")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start the game" })).toBeTruthy();
  });
});

const stubClipboard = (clipboard: unknown) =>
  Object.defineProperty(window.navigator, "clipboard", { value: clipboard, configurable: true });

describe("部屋の番号のコピー", () => {
  afterEach(() => {
    stubClipboard(undefined);
    vi.useRealTimers();
  });

  it("番号を押すと 6 桁の数字を書き、「コピーしました」を 2 秒だけ出す", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });
    render(lobbyGm());
    const code = screen.getByRole("button", { name: m.copy_code({ code: "482913" }) });
    await act(async () => fireEvent.click(code));
    expect(writeText).toHaveBeenCalledWith("482913");
    expect(code.textContent).toBe(m.code_copied());
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(code.textContent).toBe("482913");
  });

  it("上端の「部屋 482913」も押すとコピーする", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });
    render(
      <LobbyPlayer
        code="482913"
        me={{ ...players[0]!, name: players[0]!.label }}
        onRename={async () => {}}
        gmName="ゆうき"
        players={players}
        rounds={3}
        limitSec={60}
        onLeave={() => {}}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: m.copy_code({ code: "482913" }) })),
    );
    expect(writeText).toHaveBeenCalledWith("482913");
  });

  it("リンクの「コピーしました」も 2 秒で元に戻る", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    stubClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    render(lobbyGm());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: m.copy_link() })));
    expect(screen.getByRole("button", { name: m.link_copied() })).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole("button", { name: m.copy_link() })).toBeTruthy();
  });
});

describe("LobbyGm の解散", () => {
  it("ブラウザの confirm ではなく画面のシートで確かめ、やめれば何もしない", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const onDissolve = vi.fn();
    render(lobbyGm({ onDissolve }));
    fireEvent.click(screen.getByRole("button", { name: m.dissolve_button() }));
    const sheet = screen.getByRole("dialog", { name: m.dissolve_confirm() });
    fireEvent.click(within(sheet).getByRole("button", { name: m.cancel() }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onDissolve).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("シートの「解散する」で解散する", () => {
    const onDissolve = vi.fn();
    render(lobbyGm({ onDissolve }));
    fireEvent.click(screen.getByRole("button", { name: m.dissolve_button() }));
    const sheet = screen.getByRole("dialog", { name: m.dissolve_confirm() });
    fireEvent.click(within(sheet).getByRole("button", { name: m.dissolve_button() }));
    expect(onDissolve).toHaveBeenCalledOnce();
  });
});

describe("遊び方", () => {
  it("ロビーの「遊び方」で、ラウンド数と制限時間を入れたルールを 1 つずつ見せる", () => {
    render(lobbyGm({ rounds: 5, limitSec: 90 }));
    fireEvent.click(screen.getByRole("button", { name: m.rules_button() }));
    const sheet = screen.getByRole("dialog", { name: m.rules_button() });
    const next = () => fireEvent.click(within(sheet).getByRole("button", { name: m.rules_next() }));
    expect(within(sheet).getByText(m.rules_1())).toBeTruthy();
    expect(
      (within(sheet).getByRole("button", { name: m.rules_prev() }) as HTMLButtonElement).disabled,
    ).toBe(true);
    next();
    next();
    expect(within(sheet).getByText(m.rules_3({ sec: 90 }))).toBeTruthy();
    expect(within(sheet).queryByText(m.rules_1())).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: m.rules_prev() }));
    expect(within(sheet).getByText(m.rules_2())).toBeTruthy();
    for (let i = 0; i < 5; i++) next();
    expect(within(sheet).getByText(m.rules_7({ rounds: 5 }))).toBeTruthy();
    // 最後のステップでは「次へ」が「閉じる」に替わる
    expect(within(sheet).queryByRole("button", { name: m.rules_next() })).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: m.close() }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("矢印キーでもステップを送る", () => {
    render(lobbyGm());
    fireEvent.click(screen.getByRole("button", { name: m.rules_button() }));
    const sheet = screen.getByRole("dialog", { name: m.rules_button() });
    const next = within(sheet).getByRole("button", { name: m.rules_next() });
    fireEvent.keyDown(next, { key: "ArrowRight" });
    fireEvent.keyDown(next, { key: "ArrowRight" });
    expect(within(sheet).getByText(m.rules_3({ sec: 60 }))).toBeTruthy();
    fireEvent.keyDown(next, { key: "ArrowLeft" });
    expect(within(sheet).getByText(m.rules_2())).toBeTruthy();
  });
});

describe("LobbyGm のリンクのコピー", () => {
  afterEach(() => stubClipboard(undefined));

  it("clipboard が無くても、リンクを入れた入力を出す", async () => {
    stubClipboard(undefined);
    render(lobbyGm());
    fireEvent.click(screen.getByRole("button", { name: m.copy_link() }));
    expect(((await screen.findByRole("textbox")) as HTMLInputElement).value).toBe(
      `${location.origin}/r/482913`,
    );
  });

  it("/r/{code} の URL を clipboard に書く", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });
    render(lobbyGm());
    fireEvent.click(screen.getByRole("button", { name: m.copy_link() }));
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/r/482913`);
    expect(await screen.findByRole("button", { name: m.link_copied() })).toBeTruthy();
  });

  it("書けなかったら、リンクを入れた読み取り専用の入力を出す", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubClipboard({ writeText });
    render(lobbyGm());
    fireEvent.click(screen.getByRole("button", { name: m.copy_link() }));
    const input = (await screen.findByRole("textbox")) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe(`${location.origin}/r/482913`);
  });
});

describe("LobbyPlayer", () => {
  it("自分と GM に印を付け、固定の設定を出し、部屋を出られる", () => {
    const onLeave = vi.fn();
    render(
      <LobbyPlayer
        code="482913"
        me={{ pid: "a", label: "はるか", name: "はるか" }}
        onRename={async () => {}}
        gmName="ゆうき"
        players={players}
        rounds={3}
        limitSec={60}
        onLeave={onLeave}
      />,
    );
    expect(screen.getByText("はるか（あなた）")).toBeTruthy();
    expect(screen.getByText("ゆうき（GM）")).toBeTruthy();
    expect(screen.getByText("3 ラウンド")).toBeTruthy();
    expect(screen.getByText("60 秒")).toBeTruthy();
    expect(screen.getByText("部屋 482913")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.leave_button() }));
    expect(onLeave).toHaveBeenCalled();
  });
});

describe("ロビーで名前を変える", () => {
  const lobbyPlayer = (onRename: (name: string) => Promise<void>) => (
    <LobbyPlayer
      code="482913"
      me={{ pid: "a", label: "はるか (2)", name: "はるか" }}
      gmName="ゆうき"
      players={players}
      rounds={3}
      limitSec={60}
      onLeave={() => {}}
      onRename={onRename}
    />
  );
  const edit = () => {
    fireEvent.click(screen.getByRole("button", { name: m.rename_button() }));
    return screen.getByPlaceholderText(m.name_label()) as HTMLInputElement;
  };

  it("自分の札の鉛筆で、自分で付けた名前を入れた欄に変わり、決めると渡して元に戻る", async () => {
    const onRename = vi.fn(async () => {});
    render(lobbyPlayer(onRename));
    // 鉛筆は自分の札にだけ付く
    expect(screen.getAllByRole("button", { name: m.rename_button() })).toHaveLength(1);
    const input = edit();
    expect(input.value).toBe("はるか");
    fireEvent.change(input, { target: { value: "  みお " } });
    fireEvent.submit(input.form!);
    await vi.waitFor(() => expect(onRename).toHaveBeenCalledWith("みお"));
    await vi.waitFor(() => expect(screen.queryByPlaceholderText(m.name_label())).toBeNull());
  });

  it("Esc と × でやめ、同じ名前なら送らずに閉じる", () => {
    const onRename = vi.fn(async () => {});
    render(lobbyPlayer(onRename));
    fireEvent.keyDown(edit(), { key: "Escape" });
    expect(screen.queryByPlaceholderText(m.name_label())).toBeNull();
    edit();
    fireEvent.click(screen.getByRole("button", { name: m.cancel() }));
    expect(screen.queryByPlaceholderText(m.name_label())).toBeNull();
    fireEvent.click(edit().form!.querySelector("button[type=submit]")!);
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText(m.name_label())).toBeNull();
  });

  it("空の名前は送らず、失敗したら欄のまま理由を出す", async () => {
    const onRename = vi.fn(async () => {
      throw new Error("network");
    });
    render(lobbyPlayer(onRename));
    const input = edit();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: m.rename_save() }));
    expect(screen.getByRole("alert").textContent).toBe(m.error_name());
    expect(onRename).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "みお" } });
    fireEvent.click(screen.getByRole("button", { name: m.rename_save() }));
    await vi.waitFor(() => expect(onRename).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByPlaceholderText(m.name_label())).toBeTruthy();
  });

  it("GM は GM の札の鉛筆で名前を変える", async () => {
    const onRename = vi.fn(async () => {});
    render(lobbyGm({ onRename }));
    const input = edit();
    expect(input.value).toBe("ゆうき");
    fireEvent.change(input, { target: { value: "けんた" } });
    fireEvent.click(screen.getByRole("button", { name: m.rename_save() }));
    await vi.waitFor(() => expect(onRename).toHaveBeenCalledWith("けんた"));
  });
});

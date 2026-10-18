// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { m } from "../../src/client/paraglide/messages";
import { setLocale } from "../../src/client/paraglide/runtime";
import type { RoundScore } from "../../src/shared/scoring";
import { Disconnected, formatElapsed } from "../../src/client/screens/Disconnected";
import { Final } from "../../src/client/screens/Final";
import { ResultsPick, type ResultPhotoView } from "../../src/client/screens/ResultsPick";
import { ResultsReveal } from "../../src/client/screens/ResultsReveal";
import { ResultsWait } from "../../src/client/screens/ResultsWait";

beforeEach(() => setLocale("ja", { reload: false }));
afterEach(cleanup);

const photo = (pid: string, label: string, valid = true): ResultPhotoView => ({
  pid,
  label,
  url: `u:${pid}`,
  valid,
});
const PHOTOS = [
  photo("a", "そうた"),
  photo("b", "はるか"),
  photo("c", "みお"),
  photo("d", "けんた"),
];

function pick(over: Partial<Parameters<typeof ResultsPick>[0]> = {}) {
  const onToggle = vi.fn();
  const onConfirm = vi.fn();
  const ui = (
    <ResultsPick
      round={2}
      rounds={3}
      gmPhotoUrl="u:gm"
      photos={PHOTOS}
      missing={[]}
      picks={[]}
      onToggle={onToggle}
      onConfirm={onConfirm}
      {...over}
    />
  );
  return { ui, onToggle, onConfirm };
}

describe("ResultsPick", () => {
  it("2 枚選んだ状態では、決定は「あと 1 枚」で押せない", () => {
    const { ui, onConfirm } = pick({ picks: ["b", "a"] });
    render(ui);
    const button = screen.getByRole("button", {
      name: m.pick_need_more({ count: 1 }),
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("タップした順に 1、2 の印が付き、写真を押すと onToggle が呼ばれる", () => {
    const { ui, onToggle } = pick({ picks: ["b", "a"] });
    render(ui);
    expect(
      within(screen.getByRole("button", { name: /はるか/ })).getByLabelText(
        m.rank_label({ rank: 1 }),
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /そうた/ })).getByLabelText(
        m.rank_label({ rank: 2 }),
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /みお/ }));
    expect(onToggle).toHaveBeenCalledWith("c");
  });

  it("3 枚そろえば決定できる", () => {
    const { ui, onConfirm } = pick({ picks: ["b", "a", "c"] });
    render(ui);
    fireEvent.click(screen.getByRole("button", { name: m.pick_confirm() }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("無効な写真は押せない", () => {
    const { ui, onToggle } = pick({ photos: [photo("a", "そうた"), photo("b", "はるか", false)] });
    render(ui);
    const bad = screen.getByRole("button", { name: /はるか/ }) as HTMLButtonElement;
    expect(bad.disabled).toBe(true);
    fireEvent.click(bad);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("提出が 2 枚だけなら 2 枚で決定できる（未提出の人は点線の枠）", () => {
    const two = [photo("a", "そうた"), photo("b", "はるか")];
    const one = pick({ photos: two, missing: ["みお"], picks: ["a"] });
    const { rerender } = render(one.ui);
    expect(screen.getByText("みお")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: m.pick_need_more({ count: 1 }) }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    const both = pick({ photos: two, missing: ["みお"], picks: ["a", "b"] });
    rerender(both.ui);
    fireEvent.click(screen.getByRole("button", { name: m.pick_confirm() }));
    expect(both.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("有効な写真が 1 枚なら 1 枚で、0 枚なら選ばずに決定できる", () => {
    const one = pick({ photos: [photo("a", "そうた"), photo("b", "はるか", false)], picks: ["a"] });
    render(one.ui);
    fireEvent.click(screen.getByRole("button", { name: m.pick_confirm() }));
    expect(one.onConfirm).toHaveBeenCalledTimes(1);
    cleanup();
    const none = pick({ photos: [], picks: [] });
    render(none.ui);
    fireEvent.click(screen.getByRole("button", { name: m.pick_confirm() }));
    expect(none.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("写真の確認が終わるまでは決定できず、撮影秒数は出ない", () => {
    const { ui } = pick({ photos: null });
    render(ui);
    expect(screen.getByText(m.results_checking())).toBeTruthy();
    expect((screen.getAllByRole("button").at(-1) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/秒 ・/)).toBeNull();
  });
});

describe("ResultsWait", () => {
  it("写真と名前を出し、秒数は出さない", () => {
    render(
      <ResultsWait
        code="482913"
        round={2}
        rounds={3}
        gmName="ゆうき"
        gmPhotoUrl="u:gm"
        photos={PHOTOS}
        mePid="b"
      />,
    );
    expect(screen.getByText(m.results_wait_body({ name: "ゆうき" }))).toBeTruthy();
    expect(screen.getByText(m.you_tag({ name: "はるか" }))).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(PHOTOS.length + 1);
    expect(document.body.textContent).not.toMatch(/秒|×0\./);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("GM からまだ届いていなければ集めている表示", () => {
    render(
      <ResultsWait code="482913" round={2} rounds={3} gmName="ゆうき" photos={null} mePid="b" />,
    );
    expect(screen.getByText(m.results_collecting())).toBeTruthy();
  });
});

const score = (over: Partial<RoundScore> & { pid: string }): RoundScore => ({
  rank: null,
  tMs: null,
  multiplier: null,
  points: 0,
  bonus: 0,
  streak: 0,
  ...over,
});
const SCORES: RoundScore[] = [
  score({ pid: "a", rank: 1, tMs: 12_000, multiplier: 0.9, points: 900, streak: 1 }),
  score({ pid: "b", rank: 2, tMs: 6_000, multiplier: 0.95, points: 665, bonus: 200, streak: 3 }),
  score({ pid: "d" }),
];
const TOTALS = [
  { pid: "b", total: 3345, rank: 1, delta: 1 },
  { pid: "a", total: 2800, rank: 2, delta: -1 },
  { pid: "d", total: 1200, rank: 3, delta: 0 },
];
const PLAYERS = [
  { pid: "a", label: "そうた" },
  { pid: "b", label: "はるか" },
  { pid: "d", label: "けんた" },
];
const reveal = (over: Partial<Parameters<typeof ResultsReveal>[0]> = {}) => (
  <ResultsReveal
    code="482913"
    round={2}
    rounds={3}
    scores={SCORES}
    totals={TOTALS}
    players={PLAYERS}
    photoUrls={{ a: "u:a", b: "u:b" }}
    mePid="b"
    isGm={false}
    onNext={() => {}}
    {...over}
  />
);

describe("ResultsReveal", () => {
  it("撮影秒数、倍率、得点を出し、ストリークのバッジを付ける", () => {
    render(reveal());
    expect(screen.getByText("12 秒 ・ ×0.90 ・ +900")).toBeTruthy();
    expect(screen.getByText("6 秒 ・ ×0.95 ・ +665")).toBeTruthy();
    expect(screen.getByText("3連続 +200")).toBeTruthy();
    expect(screen.getAllByText(/連続/)).toHaveLength(1); // 1 連続にバッジは付けない
  });

  it("合計と順位の変動を出す。GM だけが次へ進める", () => {
    const onNext = vi.fn();
    const { unmount } = render(reveal({ isGm: true, onNext }));
    expect(screen.getByText("3,345")).toBeTruthy();
    expect(screen.getByLabelText(m.rank_up({ count: 1 }))).toBeTruthy();
    expect(screen.getByLabelText(m.rank_down({ count: 1 }))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.next_round_button() }));
    expect(onNext).toHaveBeenCalled();
    unmount();
    render(reveal());
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(m.wait_next_gm())).toBeTruthy();
  });

  it("最後のラウンドでは最終結果へのボタンになる", () => {
    render(reveal({ isGm: true, round: 3 }));
    expect(screen.getByRole("button", { name: m.see_final_button() })).toBeTruthy();
  });

  it("選ばれなかった自分には、そのことを伝える", () => {
    render(reveal({ mePid: "d" }));
    expect(screen.getByText(m.not_picked_me())).toBeTruthy();
  });

  it("提出が無く誰も選ばれなかったラウンド", () => {
    render(reveal({ scores: [score({ pid: "a" })] }));
    expect(screen.getByText(m.no_picks())).toBeTruthy();
  });

  it.each([
    ["en", "1,150", "+1,150"],
    ["de", "1.150", "+1.150"],
  ] as const)("%s では点数が Intl の書式になる", (locale, total, gain) => {
    setLocale(locale, { reload: false });
    render(
      reveal({
        scores: [
          score({ pid: "a", rank: 1, tMs: 12_000, multiplier: 0.9, points: 1150, streak: 1 }),
        ],
        totals: [{ pid: "a", total: 1150, rank: 1, delta: 0 }],
      }),
    );
    expect(screen.getByText(total)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${gain.replace(/[+.]/g, "\\$&")}$`))).toBeTruthy();
    // 倍率は 2 桁固定、de は小数点がカンマ
    expect(document.body.textContent).toContain(locale === "de" ? "×0,90" : "×0.90");
  });
});

describe("Final", () => {
  const totals = [
    { pid: "a", total: 5120, rank: 1, delta: 0 },
    { pid: "b", total: 4610, rank: 2, delta: 0 },
    { pid: "c", total: 3980, rank: 3, delta: 0 },
    { pid: "d", total: 3120, rank: 4, delta: 0 },
    { pid: "e", total: 2040, rank: 5, delta: 0 },
  ];
  const players = ["a", "b", "c", "d", "e"].map((pid, i) => ({
    pid,
    label: ["はるか", "そうた", "けんた", "みお", "あや"][i]!,
  }));
  const final = (over: Partial<Parameters<typeof Final>[0]> = {}) => (
    <Final
      code="482913"
      rounds={3}
      totals={totals}
      players={players}
      mePid="d"
      isGm={false}
      onBackToLobby={() => {}}
      onLeave={() => {}}
      {...over}
    />
  );

  it("表彰台は 2・1・3 の順で、4 位以降は一覧に並ぶ", () => {
    render(final());
    const podium = screen.getAllByRole("list")[0]!;
    const names = within(podium)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(names).toEqual(["そうた4,610" + "2", "はるか5,120" + "1", "けんた3,980" + "3"]);
    expect(screen.getByText(m.you_tag({ name: "みお" }))).toBeTruthy();
    expect(screen.getByText("2,040")).toBeTruthy();
  });

  it("GM だけがロビーに戻せる。プレイヤーは待つか部屋を出る", () => {
    const onBackToLobby = vi.fn();
    const { unmount } = render(final({ isGm: true, onBackToLobby }));
    fireEvent.click(screen.getByRole("button", { name: m.back_to_lobby() }));
    expect(onBackToLobby).toHaveBeenCalled();
    unmount();
    render(final());
    expect(screen.queryByRole("button", { name: m.back_to_lobby() })).toBeNull();
    expect(screen.getByText(m.final_wait_note())).toBeTruthy();
  });

  it("3 人に満たなくても崩れない", () => {
    render(final({ totals: totals.slice(0, 2) }));
    expect(screen.getByText("5,120")).toBeTruthy();
  });
});

describe("Disconnected", () => {
  afterEach(() => vi.useRealTimers());

  it("GM の名前、待っている時間、ここまでの自分の成績を出し、部屋を出られる", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
    const since = Date.now() - 72_000;
    const onLeave = vi.fn();
    render(
      <Disconnected
        code="482913"
        round={3}
        rounds={3}
        gmName="ゆうき"
        since={since}
        me={{ rank: 1, total: 3345 }}
        onLeave={onLeave}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("ゆうき");
    expect(screen.getByRole("timer").textContent).toContain("1:12");
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer").textContent).toContain("1:13");
    expect(screen.getByText(m.rank_points({ rank: 1, points: "3,345" }))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.leave_button() }));
    expect(onLeave).toHaveBeenCalled();
  });

  it("経過時間は m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_900)).toBe("1:05");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});

describe("ResultsScreen の未提出", () => {
  it("そのラウンドの対象者だけを未提出に出す（途中参加者は出さない）", async () => {
    const { ResultsScreen } = await import("../../src/client/screens/ResultsScreen");
    const { gmReduce, initialGmState } = await import("../../src/client/game/gmMachine");
    let s = initialGmState({ room: "482913", gmPid: "gm", locale: "ja", rounds: 3, limitSec: 60 });
    const step = (a: Parameters<typeof gmReduce>[1]) => (s = gmReduce(s, a).state);
    step({ type: "playerJoined", pid: "a", name: "そうた", at: 0 });
    step({ type: "playerJoined", pid: "b", name: "みお", at: 0 });
    step({ type: "start", gameId: "g1" });
    step({ type: "gmPhotoUploaded", key: "k" });
    step({ type: "hintsReady", hints: ["1", "2", "3", "4", "5"], at: 1000 });
    step({ type: "playerJoined", pid: "late", name: "おそい", at: 1500 }); // プレイヤーのターン中に入った
    step({ type: "tick", now: 1000 + 61_000 });
    expect(s.phase).toBe("picking");
    const players = ["a", "b", "late"].map((pid) => ({
      pid,
      label: s.players[pid]!.name,
      total: 0,
      rank: null,
    }));
    const room = {
      role: "gm",
      me: { pid: "gm", label: "gm" },
      gmName: "gm",
      status: null,
      gmDisconnectedSince: null,
      reconnecting: false,
      view: {
        phase: "picking",
        round: 1,
        rounds: 3,
        gmPid: "gm",
        players,
        results: { gmPhotoUrl: "u:gm", photos: [{ pid: "a", url: "u:a", valid: true }] },
      },
      gm: { state: s, dispatch: () => {} },
      actions: {},
    };
    render(<ResultsScreen room={room as never} code="482913" />);
    expect(screen.getByText("みお")).toBeTruthy();
    expect(screen.queryByText("おそい")).toBeNull();
  });
});

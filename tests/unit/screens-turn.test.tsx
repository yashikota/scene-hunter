// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { m } from "../../src/client/paraglide/messages";
import { setLocale } from "../../src/client/paraglide/runtime";

const camera = vi.hoisted(() => ({
  startCamera: vi.fn(),
  captureFrame: vi.fn(),
}));
vi.mock("../../src/client/photo/camera", () => camera);
const encode = vi.hoisted(() => ({
  encodeJpeg: vi.fn(),
  fitWithin: (w: number, h: number) => ({ w, h }),
  loadImageFile: vi.fn(),
}));
vi.mock("../../src/client/photo/encode", () => encode);

import { CameraBlocked } from "../../src/client/screens/CameraBlocked";
import { GmTurn } from "../../src/client/screens/GmTurn";
import { HintError } from "../../src/client/screens/HintError";
import { PlayerSubmitted } from "../../src/client/screens/PlayerSubmitted";
import { PlayerTurn, type PlayerTurnProps } from "../../src/client/screens/PlayerTurn";
import { PlayerTurnGm } from "../../src/client/screens/PlayerTurnGm";

const T0 = new Date("2026-10-17T12:00:00Z").getTime();
const stop = vi.fn();
const revoke = vi.fn();
/** setInterval を偽にしているので、waitFor の定期確認が動かない。非同期の処理を進めてから確かめる。 */
const settle = () => act(() => vi.advanceTimersByTimeAsync(50));
const bar = (n: number) => screen.getByRole("progressbar", { name: m.hint_bar_label({ n }) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(T0);
  setLocale("ja", { reload: false });
  stop.mockReset();
  camera.startCamera.mockReset().mockResolvedValue({ stop });
  camera.captureFrame.mockReset().mockReturnValue({ canvas: {}, w: 640, h: 480 });
  encode.encodeJpeg.mockReset().mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
  revoke.mockReset();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: revoke }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const playerTurn = (over: Partial<PlayerTurnProps> = {}) => (
  <PlayerTurn
    code="482913"
    round={2}
    rounds={3}
    limitSec={60}
    // 経過 24 秒（残り 36 秒）。ヒント 4 は 30 秒、5 は 40 秒で公開される
    turnStartedLocalAt={T0 - 24_000}
    hints={["赤いものが写っている", "近くに水がある", "見上げる角度で撮っている"]}
    submitted={false}
    submittedCount={0}
    playerCount={3}
    onShutter={async () => {}}
    {...over}
  />
);

describe("PlayerTurn", () => {
  it("届いたヒントを出し、まだのヒントは公開までの進みをバーで出す（秒数の文は出さない）", async () => {
    render(playerTurn());
    expect(screen.getByText("赤いものが写っている")).toBeTruthy();
    expect(screen.getByText("見上げる角度で撮っている")).toBeTruthy();
    // 経過 24 秒：ヒント 4（30 秒で公開）は 20〜30 秒の間で伸びて 40 %、ヒント 5（40 秒）はまだ 0 %
    expect(bar(4).getAttribute("aria-valuenow")).toBe("40");
    expect(bar(5).getAttribute("aria-valuenow")).toBe("0");
    expect(screen.queryByRole("progressbar", { name: m.hint_bar_label({ n: 3 }) })).toBeNull();
    expect(document.body.textContent).not.toMatch(/あと \d+ 秒/);
    expect(screen.getByRole("timer").textContent).toContain("36");
  });

  it("バーの幅は同じ割合", () => {
    render(playerTurn());
    const fill = bar(4).firstElementChild as HTMLElement;
    expect(fill.style.transform).toBe("scaleX(0.4)");
  });

  it("撮り直しのボタンを置かない", () => {
    render(playerTurn());
    expect(screen.queryByText(/撮り直す|撮り直して/)).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("時間が進むと残り時間が減る", () => {
    render(playerTurn());
    act(() => {
      vi.setSystemTime(T0 + 10_000);
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole("timer").textContent).toContain("26");
    // 経過 34.25 秒：ヒント 4 は公開の時刻を過ぎて 100 %（届くのを待つ）、ヒント 5 は 43 %
    expect(bar(4).getAttribute("aria-valuenow")).toBe("100");
    expect(bar(5).getAttribute("aria-valuenow")).toBe("43");
  });

  it("シャッターで JPEG にして出し、カメラを止めて提出済みの画面にする", async () => {
    const onShutter = vi.fn().mockResolvedValue(undefined);
    render(playerTurn({ onShutter }));
    await waitFor(() =>
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: m.shutter_button() }));
    await waitFor(() => expect(screen.getByRole("heading", { name: m.sent_title() })).toBeTruthy());
    expect(onShutter).toHaveBeenCalledOnce();
    expect(onShutter.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(stop).toHaveBeenCalled();
  });

  it("アンマウントでカメラを止める", async () => {
    const { unmount } = render(playerTurn());
    await waitFor(() => expect(camera.startCamera).toHaveBeenCalled());
    await act(async () => {});
    unmount();
    expect(stop).toHaveBeenCalled();
  });

  it("送れなかったときは同じ写真を送り直せる（撮り直しではない）", async () => {
    const onShutter = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
    render(playerTurn({ onShutter }));
    await waitFor(() =>
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: m.shutter_button() }));
    fireEvent.click(await screen.findByRole("button", { name: m.resend_button() }));
    await waitFor(() => expect(screen.getByRole("heading", { name: m.sent_title() })).toBeTruthy());
    expect(onShutter).toHaveBeenCalledTimes(2);
    expect(onShutter.mock.calls[1][0]).toBe(onShutter.mock.calls[0][0]);
    expect(camera.captureFrame).toHaveBeenCalledOnce();
  });

  it("シャッターを連打しても提出は 1 回だけ", async () => {
    const onShutter = vi.fn(() => new Promise<void>(() => {}));
    render(playerTurn({ onShutter }));
    await waitFor(() =>
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false),
    );
    const button = screen.getByRole("button", { name: m.shutter_button() });
    fireEvent.click(button);
    fireEvent.click(button);
    await settle();
    expect(onShutter).toHaveBeenCalledOnce();
    expect(camera.captureFrame).toHaveBeenCalledOnce();
  });

  it("残り 0 秒ではシャッターを押せない", async () => {
    render(playerTurn({ turnStartedLocalAt: T0 - 61_000 }));
    await settle();
    expect(
      (screen.getByRole("button", { name: m.shutter_button() }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("端末の写真を選ぶ入力が無い", () => {
    const { container } = render(playerTurn());
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("撮った写真の object URL をアンマウントで解放する", async () => {
    const { unmount } = render(playerTurn());
    await waitFor(() =>
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: m.shutter_button() }));
    await waitFor(() => expect(screen.getByRole("heading", { name: m.sent_title() })).toBeTruthy());
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });

  it("カメラが拒否されたら CameraBlocked を出し、もう一度で起動し直す", async () => {
    camera.startCamera.mockResolvedValueOnce({ error: "denied" });
    render(playerTurn());
    const retry = await screen.findByRole("button", { name: m.camera_retry() });
    expect(screen.getByText(m.camera_blocked_title())).toBeTruthy();
    fireEvent.click(retry);
    await waitFor(() => expect(camera.startCamera).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(m.camera_blocked_title())).toBeNull());
  });
});

describe("CameraBlocked", () => {
  it.each([
    ["denied", () => m.camera_denied_body()],
    ["unavailable", () => m.camera_unavailable_body()],
  ] as const)("%s の説明ともう一度", (reason, body) => {
    const onRetry = vi.fn();
    render(<CameraBlocked reason={reason} onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain(body().split("\n")[0]);
    fireEvent.click(screen.getByRole("button", { name: "もう一度" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("PlayerSubmitted", () => {
  it("撮影秒数を表示しない", () => {
    const { container } = render(
      <PlayerSubmitted
        round={2}
        rounds={3}
        startedAt={T0 - 39_000}
        limitSec={60}
        submitted={4}
        total={5}
      />,
    );
    expect(screen.getByRole("heading", { name: "提出しました" })).toBeTruthy();
    expect(screen.getByText("4 / 5 人")).toBeTruthy();
    expect(
      screen
        .getByRole("progressbar", { name: m.everyone_submitted() })
        .getAttribute("aria-valuenow"),
    ).toBe("4");
    expect(screen.getByText("残り 21 秒")).toBeTruthy();
    expect(container.textContent).not.toMatch(/39|撮影秒数/);
  });
});

describe("HintError", () => {
  it("もう一度試すと解散する", async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const onDissolve = vi.fn();
    render(<HintError round={2} rounds={3} onRetry={onRetry} onDissolve={onDissolve} />);
    fireEvent.click(screen.getByRole("button", { name: "もう一度試す" }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: m.hint_dissolve() }));
    expect(onDissolve).toHaveBeenCalledOnce();
    expect(m.hint_dissolve()).toBe("ゲームを解散する");
  });
});

describe("GmTurn", () => {
  it("撮影と写真を選ぶボタンと 60 秒のカウントダウンがある", () => {
    render(<GmTurn round={2} rounds={3} onPhoto={async () => {}} />);
    expect(screen.getByRole("button", { name: "この場で撮影する" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "撮影済みの写真から選ぶ" })).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toContain("60");
    act(() => {
      vi.setSystemTime(T0 + 18_000);
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole("timer").textContent).toContain("42");
  });

  it("60 秒を過ぎても止めず、0 で止まる", () => {
    render(<GmTurn round={2} rounds={3} onPhoto={async () => {}} />);
    act(() => {
      vi.setSystemTime(T0 + 90_000);
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole("timer").textContent).toContain("0");
    expect(
      (screen.getByRole("button", { name: m.pick_photo() }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("撮影した写真を出す", async () => {
    const onPhoto = vi.fn().mockResolvedValue(undefined);
    render(<GmTurn round={2} rounds={3} onPhoto={onPhoto} />);
    const shoot = screen.getByRole("button", { name: m.shoot_here() }) as HTMLButtonElement;
    await waitFor(() => expect(shoot.disabled).toBe(false));
    fireEvent.click(shoot);
    await settle();
    expect(onPhoto).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalled();
  });

  it("選んだファイルを JPEG にして出す", async () => {
    const onPhoto = vi.fn().mockResolvedValue(undefined);
    encode.loadImageFile.mockResolvedValue({ width: 100, height: 80, close: vi.fn() });
    render(<GmTurn round={2} rounds={3} onPhoto={onPhoto} />);
    const input = screen.getByTestId("gm-photo-file") as HTMLInputElement;
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await settle();
    expect(onPhoto).toHaveBeenCalledOnce();
    expect(encode.loadImageFile).toHaveBeenCalledWith(file);
  });

  it("成功したら送信中のままにしない", async () => {
    render(<GmTurn round={2} rounds={3} onPhoto={async () => {}} />);
    const shoot = screen.getByRole("button", { name: m.shoot_here() }) as HTMLButtonElement;
    await waitFor(() => expect(shoot.disabled).toBe(false));
    fireEvent.click(shoot);
    await settle();
    expect(screen.getByRole("button", { name: m.shoot_here() })).toBeTruthy();
  });

  it("送れなかったらエラーを出してカメラを起動し直す", async () => {
    const onPhoto = vi.fn().mockRejectedValue(new Error("x"));
    render(<GmTurn round={2} rounds={3} onPhoto={onPhoto} />);
    const shoot = screen.getByRole("button", { name: m.shoot_here() }) as HTMLButtonElement;
    await waitFor(() => expect(shoot.disabled).toBe(false));
    fireEvent.click(shoot);
    expect((await screen.findByRole("alert")).textContent).toBe(m.send_failed());
    await waitFor(() => expect(camera.startCamera).toHaveBeenCalledTimes(2));
  });
});

describe("PlayerTurnGm", () => {
  it("提出状況と、未公開のヒントの文言と公開までのバーを出す", () => {
    render(
      <PlayerTurnGm
        round={2}
        rounds={3}
        limitSec={60}
        turnStartedLocalAt={T0 - 24_000}
        hints={["a", "b", "c", "d", "e"]}
        shown={3}
        players={[
          { pid: "p1", label: "はるか" },
          { pid: "p2", label: "そうた" },
        ]}
        submitted={["p1"]}
      />,
    );
    expect(screen.getByText("1 / 2 人")).toBeTruthy();
    expect(screen.getByText("画面を閉じないでね")).toBeTruthy();
    expect(screen.getByText("提出済み")).toBeTruthy();
    expect(screen.getByText("撮影中")).toBeTruthy();
    expect(screen.getByText("d")).toBeTruthy();
    expect(bar(4).getAttribute("aria-valuenow")).toBe("40");
    expect(bar(5).getAttribute("aria-valuenow")).toBe("0");
    expect(screen.queryByRole("progressbar", { name: m.hint_bar_label({ n: 3 }) })).toBeNull();
  });
});

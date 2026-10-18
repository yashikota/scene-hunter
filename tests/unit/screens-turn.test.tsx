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
const bar = () => screen.getByRole("progressbar", { name: m.hint_timeline_label() });
/** カメラが起動するのを待って撮り、確認の画面にする。 */
async function shoot() {
  const button = screen.getByRole("button", { name: m.shutter_button() }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
  return screen.findByRole("button", { name: m.submit_photo() });
}

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
  it("届いたヒントを出し、公開の進みは 1 本のバーと 10 秒ごとの目盛りで出す（秒数の文は出さない）", async () => {
    const { container } = render(playerTurn());
    expect(screen.getByText("赤いものが写っている")).toBeTruthy();
    expect(screen.getByText("見上げる角度で撮っている")).toBeTruthy();
    // 経過 24 秒：最後のヒント（40 秒）までの 60 %
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(bar().getAttribute("aria-valuenow")).toBe("24");
    expect((bar().firstElementChild as HTMLElement).style.transform).toBe("scaleX(0.6)");
    expect(container.querySelectorAll(".sh-bar-tick")).toHaveLength(3);
    const labels = container.querySelector(".sh-timeline-labels") as HTMLElement;
    expect([...labels.children].map((e) => e.textContent)).toEqual(["10", "20", "30", "40"]);
    expect(document.body.textContent).not.toMatch(/あと \d+ 秒/);
    expect(screen.getByRole("timer").textContent).toContain("36");
  });

  it("ヒントが 5 つ出たらバーを消す", () => {
    render(playerTurn({ turnStartedLocalAt: T0 - 41_000, hints: ["a", "b", "c", "d", "e"] }));
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("撮る前は撮影のボタンだけを置く", () => {
    render(playerTurn());
    // ほかに押せるのは上端の部屋の番号（コピー）だけ
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      m.room_badge({ code: "482 913" }),
      m.shutter_button(),
    ]);
    expect(screen.getByRole("button", { name: m.shutter_button() })).toBeTruthy();
  });

  it("撮ると写真を見せて確かめさせ、提出を押すまでは何も送らない", async () => {
    const onShutter = vi.fn().mockResolvedValue(undefined);
    render(playerTurn({ onShutter }));
    await shoot();
    expect(screen.getByRole("img", { name: m.your_photo() })).toBeTruthy();
    expect(screen.getByRole("button", { name: m.retake() })).toBeTruthy();
    expect(screen.queryByRole("button", { name: m.shutter_button() })).toBeNull();
    await settle();
    expect(onShutter).not.toHaveBeenCalled();
  });

  it("撮り直すとカメラを起動し直し、前の写真の object URL を解放する", async () => {
    const onShutter = vi.fn().mockResolvedValue(undefined);
    render(playerTurn({ onShutter }));
    await shoot();
    fireEvent.click(screen.getByRole("button", { name: m.retake() }));
    await waitFor(() => expect(camera.startCamera).toHaveBeenCalledTimes(2));
    expect(revoke).toHaveBeenCalledWith("blob:x");
    expect(await shoot()).toBeTruthy();
    expect(camera.captureFrame).toHaveBeenCalledTimes(2);
    expect(onShutter).not.toHaveBeenCalled();
  });

  it("時間が進むと残り時間が減る", () => {
    render(playerTurn());
    act(() => {
      vi.setSystemTime(T0 + 10_000);
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole("timer").textContent).toContain("26");
    // 経過 34.25 秒
    expect(bar().getAttribute("aria-valuenow")).toBe("34");
  });

  it("シャッターで JPEG にして出し、カメラを止めて提出済みの画面にする", async () => {
    const onShutter = vi.fn().mockResolvedValue(undefined);
    render(playerTurn({ onShutter }));
    fireEvent.click(await shoot());
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
    fireEvent.click(await shoot());
    fireEvent.click(await screen.findByRole("button", { name: m.resend_button() }));
    await waitFor(() => expect(screen.getByRole("heading", { name: m.sent_title() })).toBeTruthy());
    expect(onShutter).toHaveBeenCalledTimes(2);
    expect(onShutter.mock.calls[1][0]).toBe(onShutter.mock.calls[0][0]);
    expect(camera.captureFrame).toHaveBeenCalledOnce();
  });

  it("シャッターや提出を連打しても、撮影も提出も 1 回だけ", async () => {
    const onShutter = vi.fn(() => new Promise<void>(() => {}));
    render(playerTurn({ onShutter }));
    const button = screen.getByRole("button", { name: m.shutter_button() }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    fireEvent.click(button);
    const submit = await screen.findByRole("button", { name: m.submit_photo() });
    fireEvent.click(submit);
    fireEvent.click(submit);
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

  it("確かめている間に時間が切れたら提出できない", async () => {
    render(playerTurn());
    const submit = (await shoot()) as HTMLButtonElement;
    act(() => {
      vi.setSystemTime(T0 + 40_000);
      vi.advanceTimersByTime(250);
    });
    expect(submit.disabled).toBe(true);
  });

  it("端末の写真を選ぶ入力が無い", () => {
    const { container } = render(playerTurn());
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("撮った写真の object URL をアンマウントで解放する", async () => {
    const { unmount } = render(playerTurn());
    fireEvent.click(await shoot());
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

  it("撮影した写真を確かめてから出す", async () => {
    const onPhoto = vi.fn().mockResolvedValue(undefined);
    render(<GmTurn round={2} rounds={3} onPhoto={onPhoto} />);
    const shoot = screen.getByRole("button", { name: m.shoot_here() }) as HTMLButtonElement;
    await waitFor(() => expect(shoot.disabled).toBe(false));
    fireEvent.click(shoot);
    const use = await screen.findByRole("button", { name: m.use_topic_photo() });
    expect(screen.getByRole("img", { name: m.topic_photo() })).toBeTruthy();
    expect(stop).toHaveBeenCalled();
    expect(onPhoto).not.toHaveBeenCalled();
    fireEvent.click(use);
    await settle();
    expect(onPhoto).toHaveBeenCalledOnce();
  });

  it("撮り直すとカメラを起動し直す", async () => {
    const onPhoto = vi.fn().mockResolvedValue(undefined);
    render(<GmTurn round={2} rounds={3} onPhoto={onPhoto} />);
    const shoot = screen.getByRole("button", { name: m.shoot_here() }) as HTMLButtonElement;
    await waitFor(() => expect(shoot.disabled).toBe(false));
    fireEvent.click(shoot);
    fireEvent.click(await screen.findByRole("button", { name: m.retake() }));
    await waitFor(() => expect(camera.startCamera).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: m.shoot_here() })).toBeTruthy();
    expect(revoke).toHaveBeenCalledWith("blob:x");
    expect(onPhoto).not.toHaveBeenCalled();
  });

  it("選んだファイルを JPEG にして確かめさせ、選び直すとファイルを選ぶ画面を開く", async () => {
    const onPhoto = vi.fn().mockResolvedValue(undefined);
    encode.loadImageFile.mockResolvedValue({ width: 100, height: 80, close: vi.fn() });
    render(<GmTurn round={2} rounds={3} onPhoto={onPhoto} />);
    const input = screen.getByTestId("gm-photo-file") as HTMLInputElement;
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(encode.loadImageFile).toHaveBeenCalledWith(file);
    fireEvent.click(await screen.findByRole("button", { name: m.repick() }));
    expect(click).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: m.use_topic_photo() }));
    await settle();
    expect(onPhoto).toHaveBeenCalledOnce();
  });

  it("成功したら送信中のままにしない", async () => {
    render(<GmTurn round={2} rounds={3} onPhoto={async () => {}} />);
    const shoot = screen.getByRole("button", { name: m.shoot_here() }) as HTMLButtonElement;
    await waitFor(() => expect(shoot.disabled).toBe(false));
    fireEvent.click(shoot);
    fireEvent.click(await screen.findByRole("button", { name: m.use_topic_photo() }));
    await settle();
    expect(screen.queryByText(m.sending_photo())).toBeNull();
  });

  it("送れなかったらエラーを出し、同じ写真で決め直せる", async () => {
    const onPhoto = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
    render(<GmTurn round={2} rounds={3} onPhoto={onPhoto} />);
    const shoot = screen.getByRole("button", { name: m.shoot_here() }) as HTMLButtonElement;
    await waitFor(() => expect(shoot.disabled).toBe(false));
    fireEvent.click(shoot);
    fireEvent.click(await screen.findByRole("button", { name: m.use_topic_photo() }));
    expect((await screen.findByRole("alert")).textContent).toBe(m.send_failed());
    fireEvent.click(screen.getByRole("button", { name: m.use_topic_photo() }));
    await settle();
    expect(onPhoto).toHaveBeenCalledTimes(2);
    expect(onPhoto.mock.calls[1][0]).toBe(onPhoto.mock.calls[0][0]);
    expect(camera.captureFrame).toHaveBeenCalledOnce();
  });
});

describe("PlayerTurnGm", () => {
  it("提出状況と、未公開のヒントの文言と公開のバーを出す", () => {
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
    expect(bar().getAttribute("aria-valuenow")).toBe("24");
  });
});

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { captureFrame, startCamera } from "../../src/client/photo/camera";

function fakeVideo(extra: Record<string, unknown> = {}) {
  return { srcObject: null, play: vi.fn().mockResolvedValue(undefined), ...extra };
}

function stubUserMedia(impl: () => Promise<unknown>) {
  const getUserMedia = vi.fn((_c?: MediaStreamConstraints) => impl());
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  return getUserMedia;
}

const domError = (name: string) => Object.assign(new Error(name), { name });

describe("startCamera", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "unavailable"],
    ["OverconstrainedError", "unavailable"],
    ["NotReadableError", "unavailable"],
  ])("%s は %s", async (name, expected) => {
    stubUserMedia(() => Promise.reject(domError(name)));
    expect(await startCamera(fakeVideo() as unknown as HTMLVideoElement)).toEqual({
      error: expected,
    });
  });

  it("背面カメラを優先して映し、stop で止める", async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    const getUserMedia = stubUserMedia(() => Promise.resolve(stream));
    const video = fakeVideo();
    const r = await startCamera(video as unknown as HTMLVideoElement);
    expect(getUserMedia.mock.calls[0][0]?.video).toEqual({ facingMode: { ideal: "environment" } });
    expect(video.srcObject).toBe(stream);
    if ("error" in r) throw new Error("unexpected error");
    r.stop();
    expect(track.stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });
});

describe("captureFrame", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("長辺 1280 に収めた canvas に写す", () => {
    const drawImage = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }) };
    vi.stubGlobal("document", { createElement: () => canvas });
    const video = { videoWidth: 4000, videoHeight: 3000 };
    const r = captureFrame(video as HTMLVideoElement);
    expect([r.w, r.h]).toEqual([1280, 960]);
    expect([canvas.width, canvas.height]).toEqual([1280, 960]);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 960);
  });
});

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { LinkWatch, RECONNECT_NOTICE_MS } from "../../src/client/game/linkWatch";

afterEach(() => vi.useRealTimers());

describe("LinkWatch", () => {
  it("切れてから 3 秒つながらなければ reconnecting にして知らせ、つながったら戻して知らせる", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const changed = vi.fn();
    const w = new LinkWatch(() => Date.now(), changed);
    w.set("pub", "down");
    w.set("follow", "down");
    expect(w.down).toBe(true);
    vi.advanceTimersByTime(RECONNECT_NOTICE_MS - 1);
    expect(w.reconnecting).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(w.reconnecting).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    w.set("pub", "up");
    expect(w.reconnecting).toBe(true); // follow がまだ切れている
    w.set("follow", "up");
    expect(w.reconnecting).toBe(false);
    expect(w.down).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("3 秒以内につながれば何も出さない（最初の up も何もしない）", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const changed = vi.fn();
    const w = new LinkWatch(() => Date.now(), changed);
    w.set("gm", "up");
    w.set("gm", "down");
    vi.advanceTimersByTime(1000);
    w.set("gm", "up");
    vi.advanceTimersByTime(10_000);
    expect(w.reconnecting).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });
});

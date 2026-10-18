import type { SessionStatus } from "../moq/session";

/** 自分の接続が切れてから、画面に「つなぎ直しています」を出すまでの時間。短い切断では何も出さない。 */
export const RECONNECT_NOTICE_MS = 3000;

/**
 * 自分の MoQ セッション（GM なら gm/{epoch} を出すもの、プレイヤーなら publish 用と follow 用）が
 * 切れているかを束ねる。どれかが切れてから RECONNECT_NOTICE_MS 経つと reconnecting が true になり、onChange を呼ぶ。
 */
export class LinkWatch {
  readonly #down = new Set<string>();
  #since: number | null = null;
  #timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly now: () => number,
    private readonly onChange: () => void,
  ) {}

  /** 切れてから RECONNECT_NOTICE_MS 以上つながっていない。 */
  get reconnecting(): boolean {
    return this.#since !== null && this.now() - this.#since >= RECONNECT_NOTICE_MS;
  }

  /** いま 1 本でも切れているか（時間は問わない）。 */
  get down(): boolean {
    return this.#down.size > 0;
  }

  set(key: string, status: SessionStatus): void {
    if (status === "down") {
      this.#down.add(key);
      if (this.#since !== null) return;
      this.#since = this.now();
      this.#timer = setTimeout(() => this.onChange(), RECONNECT_NOTICE_MS);
      return;
    }
    if (!this.#down.delete(key) || this.#down.size > 0) return;
    const shown = this.reconnecting;
    clearTimeout(this.#timer);
    this.#since = null;
    if (shown) this.onChange();
  }

  close(): void {
    clearTimeout(this.#timer);
  }
}

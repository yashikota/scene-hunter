import type { Envelope } from '../../shared/envelope';
import type { MoqSession } from '../moq/session';

// MoQ のフレームは封筒の UTF-8 JSON（follow.ts と gmInbox.ts が読む形）。
const encoder = new TextEncoder();
export const encodeFrame = (env: Envelope<unknown>): Uint8Array =>
  encoder.encode(JSON.stringify(env));

const RETRY_MS = 1000;

/** つながるまで 1 秒おきに start をやり直す。張れた後の再接続は MoqSession が受け持つ。 */
export function keepStarting(session: MoqSession, closed: () => boolean): void {
  const attempt = (): void =>
    void session.start().catch((e: unknown) => {
      console.warn('MoQ の接続に失敗した', e);
      if (!closed()) setTimeout(attempt, RETRY_MS);
    });
  attempt();
}

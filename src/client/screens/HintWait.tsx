import { m } from '../paraglide/messages';
import { Screen } from '../ui/Screen';
import { formatCode, TopBar } from '../ui/TopBar';

/** バーが 90 % 近くまで伸びるまでの秒数。AI の応答は数秒から 1 分以上までばらつくので、満タンにはしない。 */
export const HINT_WAIT_EASE_SEC = 30;

/** ヒントを作っている間の待ち（GM もプレイヤーも同じ）。経過に合わせて伸びるバーだけを出す。 */
export function HintWait({
  code,
  round,
  rounds,
  gm = false,
}: {
  code: string;
  round: number;
  rounds: number;
  gm?: boolean;
}) {
  return (
    <Screen>
      <TopBar
        left={m.round_label({ round, rounds })}
        right={
          gm ? (
            <span className="sh-badge">{m.you_are_gm()}</span>
          ) : (
            <span>{m.room_badge({ code: formatCode(code) })}</span>
          )
        }
      />
      <div role="status" className="sh-center">
        <span className="sh-bar sh-bar--wide" aria-hidden="true">
          <span
            className="sh-bar-fill sh-fill-90"
            style={{ animationDuration: `${HINT_WAIT_EASE_SEC}s` }}
          />
        </span>
        <h1 className="sh-display" style={{ fontSize: 24, lineHeight: 1.4 }}>
          {m.hint_wait_title()}
        </h1>
      </div>
    </Screen>
  );
}

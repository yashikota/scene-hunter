import * as mo from "motion/react-m";
import { m } from "../paraglide/messages";
import { SPRING } from "../ui/motion";
import { HINT_COUNT, HINT_INTERVAL_SEC, HINT_TIMELINE_SEC, hintTimeline } from "./turnTime";

export interface HintListProps {
  /** 文言が分かっているヒント（プレイヤーは公開済みのものだけ、GM は 5 つとも）。 */
  hints: readonly (string | undefined)[];
  /** 公開済みのヒントの数。 */
  shown: number;
  turnStartedLocalAt: number | null;
  /** 画面の時計（useNow）。バーはこの値から計算し、別の時計は持たない。 */
  now: number;
}

/** 目盛りの秒数（10、20、30、40）。ヒント 2〜5 がこの時刻に出る。 */
const MARKS = Array.from({ length: HINT_COUNT - 1 }, (_, i) => (i + 1) * HINT_INTERVAL_SEC);
const at = (sec: number) => `${(sec / HINT_TIMELINE_SEC) * 100}%`;

/**
 * 5 つのヒントの一覧。上に 1 本のバーを置き、10 秒ごとの目盛りで次のヒントが出る時刻を見せる
 * （全部出たらバーは消す）。まだ公開されていないヒントは薄く出し、GM には文言も添える。
 */
export function HintList({ hints, shown, turnStartedLocalAt, now }: HintListProps) {
  const progress = hintTimeline(turnStartedLocalAt, now);
  return (
    <div className="sh-hint-area">
      {shown < HINT_COUNT && (
        <div className="sh-timeline">
          <span
            className="sh-bar"
            role="progressbar"
            aria-label={m.hint_timeline_label()}
            aria-valuemin={0}
            aria-valuemax={HINT_TIMELINE_SEC}
            aria-valuenow={Math.floor(progress * HINT_TIMELINE_SEC)}
          >
            <span className="sh-bar-fill" style={{ transform: `scaleX(${progress})` }} />
            {MARKS.slice(0, -1).map((sec) => (
              <span key={sec} className="sh-bar-tick" style={{ left: at(sec) }} />
            ))}
          </span>
          <span className="sh-timeline-labels" aria-hidden="true">
            {MARKS.map((sec) => (
              <span key={sec} style={{ left: at(sec) }}>
                {sec}
              </span>
            ))}
          </span>
        </div>
      )}
      <ol className="sh-hints">
        {Array.from({ length: HINT_COUNT }, (_, i) => {
          const text = hints[i];
          const locked = i >= shown;
          return (
            // 公開された瞬間に作り直し、横から飛び込ませる
            <mo.li
              key={`${i}-${locked}`}
              className={locked ? "sh-hint sh-hint--locked" : "sh-hint"}
              initial={locked ? false : { opacity: 0, x: -24, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={SPRING}
            >
              <mo.span
                className="sh-hint-no"
                initial={locked ? false : { rotate: -180, scale: 0.3 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ ...SPRING, delay: 0.08 }}
              >
                {i + 1}
              </mo.span>
              {text !== undefined && (
                <span className={locked ? "sh-hint-preview" : undefined}>{text}</span>
              )}
            </mo.li>
          );
        })}
      </ol>
    </div>
  );
}

import { m } from "../paraglide/messages";
import { HINT_COUNT, hintProgress } from "./turnTime";

export interface HintListProps {
  /** 文言が分かっているヒント（プレイヤーは公開済みのものだけ、GM は 5 つとも）。 */
  hints: readonly (string | undefined)[];
  /** 公開済みのヒントの数。 */
  shown: number;
  turnStartedLocalAt: number | null;
  /** 画面の時計（useNow）。バーはこの値から計算し、別の時計は持たない。 */
  now: number;
}

/**
 * 5 つのヒントの一覧。まだ公開されていないヒントは、公開までの進みを横のバーで出す
 * （GM には文言も薄く添える）。
 */
export function HintList({ hints, shown, turnStartedLocalAt, now }: HintListProps) {
  return (
    <ol className="sh-hints">
      {Array.from({ length: HINT_COUNT }, (_, i) => {
        const text = hints[i];
        const locked = i >= shown;
        if (!locked) {
          return (
            <li key={i} className="sh-hint">
              <span className="sh-hint-no">{i + 1}</span>
              <span>{text}</span>
            </li>
          );
        }
        const pct = Math.round(hintProgress(i, turnStartedLocalAt, now) * 100);
        return (
          <li key={i} className="sh-hint sh-hint--locked">
            <span className="sh-hint-no">{i + 1}</span>
            <span className="sh-hint-body">
              {text !== undefined && <span className="sh-hint-preview">{text}</span>}
              <span
                className="sh-bar"
                role="progressbar"
                aria-label={m.hint_bar_label({ n: i + 1 })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <span className="sh-bar-fill" style={{ transform: `scaleX(${pct / 100})` }} />
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

import { useEffect, useId, useState } from "react";

/**
 * 遊び方の各ステップに添える、動く絵。絵はコマ（frame）で進め、コマの間は CSS の transition でつなぐ。
 * 文は絵の下に出すので、絵そのものは読み上げない。
 */

const FRAME_MS = 650;

/** 0 から count - 1 までのコマを繰り返す。動きを減らす設定なら、絵が一番伝わる last のコマで止める。 */
function useFrame(count: number, last = count - 1): number {
  const [frame, setFrame] = useState(0);
  const [still] = useState(
    () =>
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % count), FRAME_MS);
    return () => clearInterval(id);
  }, [count, still]);
  return still ? last : frame;
}

const on = (shown: boolean) => (shown ? "ra-on" : "ra-off");

/**
 * 景色の写真。scene はお題（topic）との似かた：near は少しずれた同じ山、far は別の山、sea は海。
 * 遊び方の 4 つめで、お題に近い順に選ぶ様子を見せるのに使う。
 */
type Scene = "topic" | "near" | "far" | "sea";

function Photo({
  x,
  y,
  w,
  h,
  className,
  framed = true,
  scene = "topic",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  className?: string;
  framed?: boolean;
  scene?: Scene;
}) {
  const at = (px: number, py: number) => `${x + w * px} ${y + h * py}`;
  const sun = { topic: [0.74, 0.3], near: [0.62, 0.36], far: [0.24, 0.28], sea: [0.5, 0.56] }[
    scene
  ];
  return (
    <g className={className}>
      <rect x={x} y={y} width={w} height={h} rx={6} className="ra-sky" />
      <circle cx={x + w * sun[0]} cy={y + h * sun[1]} r={h * 0.13} className="ra-sun" />
      {scene === "topic" && (
        <path
          d={`M${at(0, 1)} L${at(0.34, 0.42)} L${at(0.54, 0.7)} L${at(0.7, 0.56)} L${at(1, 1)} Z`}
          className="ra-mtn"
        />
      )}
      {scene === "near" && (
        <path
          d={`M${at(0, 1)} L${at(0.42, 0.48)} L${at(0.6, 0.74)} L${at(0.78, 0.6)} L${at(1, 0.9)} L${at(1, 1)} Z`}
          className="ra-mtn"
        />
      )}
      {scene === "far" && (
        <path d={`M${at(0, 1)} L${at(0.56, 0.36)} L${at(1, 1)} Z`} className="ra-mtn ra-mtn--far" />
      )}
      {scene === "sea" && (
        <path
          d={`M${at(0, 0.62)} Q${at(0.25, 0.56)} ${at(0.5, 0.62)} T${at(1, 0.62)} V${y + h - 6} Q${at(1, 1)} ${x + w - 6} ${y + h} H${x + 6} Q${at(0, 1)} ${x} ${y + h - 6} Z`}
          className="ra-sea"
        />
      )}
      {framed && <rect x={x} y={y} width={w} height={h} rx={6} className="ra-frame" />}
    </g>
  );
}

/** 時間のバー。p は 0 から 1 の伸び。 */
function Bar({
  x,
  y,
  w,
  p,
  tone = "timer",
}: {
  x: number;
  y: number;
  w: number;
  p: number;
  tone?: "timer" | "accent";
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={12} rx={6} className="ra-track" />
      <rect
        x={x}
        y={y}
        width={w}
        height={12}
        rx={6}
        className={`ra-fill ra-fill--${tone}`}
        style={{ transform: `scaleX(${Math.max(p, 0.001)})` }}
      />
      <rect x={x} y={y} width={w} height={12} rx={6} className="ra-frame" />
    </g>
  );
}

function Check({ cx, cy, shown }: { cx: number; cy: number; shown: boolean }) {
  return (
    <g className={`ra-pop ${on(shown)}`}>
      <circle cx={cx} cy={cy} r={11} className="ra-ok" />
      <path d={`M${cx - 5} ${cy} l3.5 4 l6.5 -7.5`} className="ra-stroke" />
    </g>
  );
}

/** 1. GM がお題を撮る：画面が光って、写真が飛び出す。 */
function Shoot() {
  const f = useFrame(7, 4);
  return (
    <>
      <rect x={56} y={12} width={76} height={116} rx={14} className="ra-device" />
      <Photo x={63} y={24} w={62} h={80} />
      <rect
        x={63}
        y={24}
        width={62}
        height={80}
        rx={6}
        className={`ra-flash ${f === 2 ? "ra-flash--on" : ""}`}
      />
      <circle cx={94} cy={116} r={6} className={`ra-shutter ${f === 2 ? "ra-press" : ""}`} />
      <g className={`ra-fly ${on(f >= 3)}`}>
        <Photo x={146} y={36} w={68} h={54} />
        <circle cx={212} cy={38} r={9} className="ra-star" />
      </g>
    </>
  );
}

/** 2. ヒントが 10 秒ごとに 1 つずつ増え、後ほど長く（具体的に）なる。 */
function Hints() {
  const f = useFrame(8, 6);
  const shown = Math.min(f, 5);
  return (
    <>
      {[56, 84, 112, 140, 168].map((w, i) => (
        <g key={i} className={`ra-pop ra-pop--left ${on(i < shown)}`}>
          <rect x={22} y={8 + i * 19} width={w + 16} height={15} rx={7.5} className="ra-bubble" />
          <circle cx={31} cy={15.5 + i * 19} r={3} className="ra-dot" />
          <rect x={40} y={13.5 + i * 19} width={w - 10} height={4} rx={2} className="ra-text" />
        </g>
      ))}
      <Bar x={22} y={112} w={196} p={shown / 5} />
    </>
  );
}

/** 3. お題と同じ景色を探して撮る：のぞいた景色が動いて、合ったところで撮る。 */
function Hunt() {
  const f = useFrame(8, 5);
  const pan = [-34, -20, -8, 0, 0, 0, 0, 0][f];
  const clip = useId();
  return (
    <>
      <Photo x={18} y={30} w={56} h={44} className="ra-topic" />
      <rect x={18} y={30} width={56} height={44} rx={6} className="ra-frame ra-frame--gold" />
      <path d="M84 52 h22" className="ra-stroke ra-dash" />
      <path d="M100 46 l7 6 l-7 6" className="ra-stroke" />
      <rect x={118} y={8} width={92} height={112} rx={14} className="ra-device" />
      <clipPath id={clip}>
        <rect x={126} y={22} width={76} height={76} rx={6} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect x={126} y={22} width={76} height={76} className="ra-sky" />
        <g className="ra-pan" style={{ transform: `translateX(${pan}px)` }}>
          <Photo x={126} y={22} w={76} h={76} framed={false} />
        </g>
      </g>
      <rect x={126} y={22} width={76} height={76} rx={6} className="ra-frame" />
      <rect
        x={126}
        y={22}
        width={76}
        height={76}
        rx={6}
        className={`ra-flash ${f === 4 ? "ra-flash--on" : ""}`}
      />
      <Check cx={198} cy={24} shown={f >= 5} />
      <Bar x={18} y={112} w={84} p={1 - f / 9} />
    </>
  );
}

/** 4. GM が近い順に 3 枚を選ぶ。 */
function Pick() {
  const f = useFrame(7, 5);
  // 写真ごとのお題との似かたと、付く順位（0 は選ばれない）
  const shots: { scene: Scene; rank: number }[] = [
    { scene: "far", rank: 3 },
    { scene: "topic", rank: 1 },
    { scene: "sea", rank: 0 },
    { scene: "near", rank: 2 },
  ];
  return (
    <>
      <Photo x={8} y={40} w={46} h={58} />
      <rect x={8} y={40} width={46} height={58} rx={6} className="ra-frame ra-frame--gold" />
      <path d="M61 30 V116" className="ra-stroke ra-dash" />
      {shots.map(({ scene, rank }, i) => {
        const x = 68 + i * 43;
        // 1 位、2 位、3 位の順に付ける
        const shown = rank > 0 && f >= rank;
        return (
          <g key={scene} className={f >= 4 && rank === 0 ? "ra-dim" : ""}>
            <g className={shown ? "ra-lift" : "ra-rest"}>
              <Photo x={x} y={56} w={38} h={48} scene={scene} />
            </g>
            <g className={`ra-pop ${on(shown)}`}>
              <circle cx={x + 19} cy={42} r={11} className={`ra-medal ra-medal--${rank}`} />
              <text x={x + 19} y={47} className="ra-num">
                {rank}
              </text>
            </g>
          </g>
        );
      })}
    </>
  );
}

/** 5. 1 位 1000 点、2 位 700 点、3 位 400 点。遅く出すほど減り、時間ぎりぎりで半分。 */
function Score() {
  const f = useFrame(8, 2);
  const t = [0, 0, 0, 1 / 3, 2 / 3, 1, 1, 1][f];
  const grow = f >= 1 ? 1 : 0;
  return (
    <>
      {[1000, 700, 400].map((base, i) => {
        const pts = Math.round(base * (1 - 0.5 * t));
        const h = (pts / 1000) * 70 * grow;
        const x = 36 + i * 50;
        return (
          <g key={base}>
            <rect
              x={x}
              y={98 - 70}
              width={34}
              height={70}
              rx={5}
              className={`ra-col ra-medal--${i + 1} ${on(grow > 0)}`}
              style={{ transform: `scaleY(${Math.max(h / 70, 0.001)})` }}
            />
            <text x={x + 17} y={92 - h} className="ra-pts">
              {grow ? pts : ""}
            </text>
            <text x={x + 17} y={114} className="ra-num ra-num--sub">
              {i + 1}
            </text>
          </g>
        );
      })}
      <path d="M28 98 H190" className="ra-stroke" />
      <circle cx={208} cy={64} r={18} className="ra-clock" />
      <path
        d="M208 64 L208 50"
        className="ra-stroke ra-hand"
        style={{ transform: `rotate(${t * 360}deg)` }}
      />
    </>
  );
}

/** 6. 続けて選ばれると、1 回ごとに +100 点。 */
function Streak() {
  const f = useFrame(7, 5);
  return (
    <>
      {[0, 1, 2].map((i) => {
        const x = 30 + i * 66;
        return (
          <g key={i}>
            <Photo x={x} y={58} w={50} h={46} className={on(f >= i + 1)} />
            <rect
              x={x}
              y={58}
              width={50}
              height={46}
              rx={6}
              className={`ra-slot ${f >= i + 1 ? "ra-off" : ""}`}
            />
            <Check cx={x + 50} cy={57} shown={f >= i + 1} />
            {i > 0 && (
              <g className={`ra-rise ${on(f >= i + 2)}`}>
                <rect x={x - 4} y={22} width={58} height={24} rx={12} className="ra-plus" />
                <text x={x + 25} y={39} className="ra-num">
                  +{i * 100}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </>
  );
}

/** 7. ラウンドの合計点で競う。 */
function Total() {
  const f = useFrame(7, 5);
  return (
    <>
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx={40 + i * 26}
          cy={110}
          r={8}
          className={`ra-round ${f >= i + 1 ? "ra-round--done" : ""}`}
        />
      ))}
      {[
        { x: 128, h: 34, rank: 2 },
        { x: 158, h: 50, rank: 1 },
        { x: 188, h: 24, rank: 3 },
      ].map(({ x, h, rank }) => (
        <g key={rank}>
          <rect
            x={x}
            y={120 - h}
            width={30}
            height={h}
            className={`ra-col ra-medal--${rank} ${on(f >= 4)}`}
            style={{ transform: `scaleY(${f >= 4 ? 1 : 0.001})` }}
          />
          <text x={x + 15} y={120 - h / 2 + 5} className={`ra-num ${on(f >= 4)}`}>
            {rank}
          </text>
        </g>
      ))}
      <g className={`ra-pop ra-trophy ${on(f >= 5)}`}>
        <path d="M160 18 h26 v10 a13 13 0 0 1 -26 0 Z" className="ra-cup" />
        <path d="M160 22 h-6 a6 6 0 0 0 6 10 M186 22 h6 a6 6 0 0 1 -6 10" className="ra-stroke" />
        <path d="M173 41 v8 M165 52 h16" className="ra-stroke" />
      </g>
      <g className={`ra-spark ${on(f >= 5)}`}>
        <path d="M142 18 l4 0 M140 30 l5 -2 M204 18 l-4 0 M206 30 l-5 -2" className="ra-stroke" />
      </g>
    </>
  );
}

const ARTS = [Shoot, Hints, Hunt, Pick, Score, Streak, Total];
export const RULE_STEPS = ARTS.length;

export function RulesArt({ step }: { step: number }) {
  const Art = ARTS[step];
  return (
    <svg viewBox="0 0 240 132" className="ra" aria-hidden="true" focusable="false">
      <Art />
    </svg>
  );
}

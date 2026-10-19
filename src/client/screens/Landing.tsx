import { Link } from "@tanstack/react-router";
import * as mo from "motion/react-m";
import { useState, type ReactNode } from "react";
import { BASE_POINTS, speedMultiplier, streakBonus } from "../../shared/scoring";
import { m } from "../paraglide/messages";
import { formatMultiplier, formatNumber } from "../ui/format";
import { LanguageSelect } from "../ui/LanguageSelect";
import { useBrowserLocale } from "../ui/locale";
import { Phrase, useBudoux } from "../ui/Phrase";
import { SPRING } from "../ui/motion";
import { RULE_STEPS, RulesArt } from "./RulesArt";

/** 遊び方の例に使う制限時間とラウンド数（部屋を作るときの決まった値）。 */
const LIMIT_SEC = 60;
const ROUNDS = 3;

/** スクロールして見えたところで、下から浮かび上がらせる。 */
const RISE = {
  initial: { opacity: 0, y: 36 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { type: "spring", stiffness: 160, damping: 20 },
} as const;

/** 紹介のページ（/lp）。遊び方を動く絵で見せ、点数の計算はその場で試せる。 */
export function Landing() {
  const [locale, setLocale] = useBrowserLocale();
  useBudoux();
  const rules = [
    m.rules_1(),
    m.rules_2(),
    m.rules_3({ sec: LIMIT_SEC }),
    m.rules_4(),
    m.rules_5(),
    m.rules_6(),
    m.rules_7({ rounds: ROUNDS }),
  ];
  const titles = [
    m.lp_step_1(),
    m.lp_step_2(),
    m.lp_step_3(),
    m.lp_step_4(),
    m.lp_step_5(),
    m.lp_step_6(),
    m.lp_step_7(),
  ];
  return (
    <div className="lp">
      <header className="lp-header">
        <span className="sh-topbar-brand">
          <img src="/camera.webp" alt="" width={26} height={26} />
          <span className="sh-brand" style={{ fontSize: 16 }}>
            {m.app_name()}
          </span>
        </span>
        <LanguageSelect locale={locale} onLocale={setLocale} />
      </header>

      <main>
        <section className="lp-hero">
          <Floaters />
          <div className="lp-hero-text">
            <mo.img
              src="/camera.webp"
              alt=""
              width={120}
              height={120}
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0, y: [0, -8, 0] }}
              transition={{
                scale: { type: "spring", stiffness: 260, damping: 11 },
                rotate: { type: "spring", stiffness: 260, damping: 11 },
                y: { duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 0.9 },
              }}
            />
            <mo.h1
              className="sh-brand lp-title"
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...SPRING, delay: 0.15 }}
            >
              {m.app_name()}
            </mo.h1>
            <mo.p
              className="lp-tagline"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: 0.3 }}
            >
              <Phrase>{m.lp_tagline()}</Phrase>
            </mo.p>
            <Cta delay={0.45} />
          </div>
          <mo.div
            className="lp-hero-art"
            initial={{ opacity: 0, rotate: 8, scale: 0.85 }}
            animate={{ opacity: 1, rotate: -2, scale: 1 }}
            transition={{ type: "spring", stiffness: 140, damping: 14, delay: 0.35 }}
          >
            <RulesArt step={2} />
          </mo.div>
        </section>

        <Section title={m.lp_about_title()}>
          <About />
        </Section>

        <Section title={m.lp_roles_title()}>
          <Roles />
        </Section>

        <Section title={m.lp_flow_title()}>
          <Flow />
        </Section>

        <Section title={m.lp_howto_title()}>
          <ol className="lp-steps">
            {Array.from({ length: RULE_STEPS }, (_, i) => (
              <mo.li key={i} className="lp-step" {...RISE}>
                <RulesArt step={i} />
                <h3 className="lp-step-title">
                  <span className="sh-rule-num">{i + 1}</span>
                  <Phrase>{titles[i]}</Phrase>
                </h3>
                <p className="lp-step-text">
                  <Phrase>{rules[i]}</Phrase>
                </p>
              </mo.li>
            ))}
          </ol>
        </Section>

        <Section title={m.lp_score_title()}>
          <mo.div className="lp-card" {...RISE}>
            <p className="lp-lead">
              <Phrase>{m.lp_score_lead()}</Phrase>
            </p>
            <ScoreDemo />
          </mo.div>
        </Section>

        <Section title={m.lp_features_title()}>
          <ul className="lp-features">
            {FEATURES.map(({ icon, title, body }, i) => (
              <mo.li
                key={i}
                className="lp-feature"
                {...RISE}
                transition={{ ...RISE.transition, delay: i * 0.08 }}
              >
                <span className="lp-feature-icon" aria-hidden="true">
                  {icon}
                </span>
                <h3>
                  <Phrase>{title()}</Phrase>
                </h3>
                <p>
                  <Phrase>{body()}</Phrase>
                </p>
              </mo.li>
            ))}
          </ul>
        </Section>

        <mo.section className="lp-final" {...RISE}>
          <h2 className="sh-display">
            <Phrase>{m.lp_final_title()}</Phrase>
          </h2>
          <Cta />
        </mo.section>
      </main>
    </div>
  );
}

/** 同じ場所に集まって、1 人 1 台のスマホで遊ぶことを、絵と 3 つの札で見せる。 */
function About() {
  const points = [
    {
      icon: icon(
        "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21M12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
      ),
      text: m.lp_about_1(),
    },
    {
      icon: icon("M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1M11 18h2"),
      text: m.lp_about_2(),
    },
    {
      icon: icon(
        "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M16 14.5a5 5 0 0 1 5 5.5",
      ),
      text: m.lp_about_3(),
    },
  ];
  return (
    <mo.div className="lp-card lp-about" {...RISE}>
      <PartyArt />
      <p className="lp-lead">
        <Phrase>{m.lp_about_lead()}</Phrase>
      </p>
      <ul className="lp-about-points">
        {points.map(({ icon: i, text }, n) => (
          <mo.li
            key={n}
            initial={{ opacity: 0, scale: 0.6 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ ...SPRING, delay: 0.15 + n * 0.12 }}
          >
            <span className="lp-feature-icon" aria-hidden="true">
              {i}
            </span>
            <Phrase>{text}</Phrase>
          </mo.li>
        ))}
      </ul>
    </mo.div>
  );
}

/** 公園に集まった 5 人。王冠の 1 人が GM で、みんなスマホを持って、順にはずむ。 */
function PartyArt() {
  const people = [
    { x: 34, color: "#ff9447", gm: false },
    { x: 92, color: "#3d6bf0", gm: false },
    { x: 150, color: "#ffe36b", gm: true },
    { x: 208, color: "#7cc77a", gm: false },
    { x: 266, color: "#f2b98a", gm: false },
  ];
  return (
    <svg viewBox="0 0 320 130" className="lp-party" aria-hidden="true" focusable="false">
      <circle cx={302} cy={22} r={12} className="ra-sun" />
      <path d="M0 112 Q160 96 320 112 V130 H0 Z" className="ra-mtn" />
      {people.map(({ x, color, gm }, i) => (
        <g key={x} className="lp-person" style={{ animationDelay: `${i * -0.35}s` }}>
          <rect
            x={x - 14}
            y={70}
            width={28}
            height={36}
            rx={12}
            style={{ fill: color }}
            className="lp-ink"
          />
          <circle cx={x} cy={56} r={12} className="lp-face lp-ink" />
          <rect x={x + 8} y={74} width={11} height={17} rx={3} className="lp-phone lp-ink" />
          {gm && (
            <path
              d={`M${x - 11} 44 l3 -12 l5 6 l3 -9 l3 9 l5 -6 l3 12 Z`}
              className="lp-crown lp-ink"
            />
          )}
        </g>
      ))}
    </svg>
  );
}

/** ゲームマスター（GM）とプレイヤーの役割を並べる。 */
function Roles() {
  const roles = [
    {
      name: m.lp_role_gm(),
      tone: "gm",
      items: [m.lp_role_gm_1(), m.lp_role_gm_2(), m.lp_role_gm_3(), m.lp_role_gm_4()],
      art: (
        <svg viewBox="0 0 40 40" width={44} height={44} aria-hidden="true" focusable="false">
          <path d="M6 30 l3 -18 l7 8 l4 -12 l4 12 l7 -8 l3 18 Z" className="lp-crown lp-ink" />
        </svg>
      ),
    },
    {
      name: m.lp_role_player(),
      tone: "player",
      items: [m.lp_role_player_1(), m.lp_role_player_2(), m.lp_role_player_3()],
      art: (
        <svg viewBox="0 0 40 40" width={44} height={44} aria-hidden="true" focusable="false">
          <rect x={11} y={4} width={18} height={32} rx={4} className="lp-phone lp-ink" />
          <circle cx={20} cy={18} r={5} className="ra-sun" />
        </svg>
      ),
    },
  ];
  return (
    <div className="lp-roles-wrap">
      <ul className="lp-roles">
        {roles.map(({ name, tone, items, art }, i) => (
          <mo.li
            key={tone}
            className={`lp-role lp-role--${tone}`}
            initial={{ opacity: 0, x: i === 0 ? -40 : 40, rotate: i === 0 ? -3 : 3 }}
            whileInView={{ opacity: 1, x: 0, rotate: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ type: "spring", stiffness: 160, damping: 16 }}
          >
            <div className="lp-role-head">
              <span className="lp-role-art" aria-hidden="true">
                {art}
              </span>
              <h3>
                <Phrase>{name}</Phrase>
              </h3>
              {tone === "gm" && <span className="lp-role-count">× 1</span>}
            </div>
            <ul className="lp-role-items">
              {items.map((text, n) => (
                <mo.li
                  key={n}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ ...SPRING, delay: 0.25 + n * 0.1 }}
                >
                  <Phrase>{text}</Phrase>
                </mo.li>
              ))}
            </ul>
          </mo.li>
        ))}
      </ul>
      <p className="lp-note">
        <Phrase>{m.lp_role_note()}</Phrase>
      </p>
    </div>
  );
}

/** 部屋を作ってから最終結果までの流れ。ラウンドの中身は、くり返しの枠で囲む。 */
function Flow() {
  const round = [m.lp_flow_r1(), m.lp_flow_r2(), m.lp_flow_r3(), m.lp_flow_r4()];
  let n = 0;
  const pop = () => ({
    initial: { opacity: 0, y: 20, scale: 0.85 },
    whileInView: { opacity: 1, y: 0, scale: 1 },
    viewport: { once: true, margin: "-40px" },
    transition: { ...SPRING, delay: 0.1 + n++ * 0.12 },
  });
  return (
    <ol className="lp-flow">
      <mo.li className="lp-flow-node" {...pop()}>
        <span className="lp-flow-who lp-flow-who--gm" aria-hidden="true">
          GM
        </span>
        <Phrase>{m.lp_flow_1()}</Phrase>
      </mo.li>
      <Arrow />
      <mo.li className="lp-flow-node" {...pop()}>
        <span className="lp-flow-who" aria-hidden="true">
          {icon(
            "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M16 14.5a5 5 0 0 1 5 5.5",
          )}
        </span>
        <Phrase>{m.lp_flow_2()}</Phrase>
      </mo.li>
      <Arrow />
      <mo.li className="lp-flow-loop" {...pop()}>
        <span className="lp-flow-loop-label">
          <svg viewBox="0 0 24 24" width={20} height={20} className="lp-spin" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" className="ra-stroke" />
          </svg>
          <Phrase>{m.lp_flow_repeat({ rounds: ROUNDS })}</Phrase>
        </span>
        <ol className="lp-flow-round">
          {round.map((text, i) => (
            <mo.li key={i} className="lp-flow-chip" {...pop()}>
              <span className="sh-rule-num">{i + 1}</span>
              <Phrase>{text}</Phrase>
            </mo.li>
          ))}
        </ol>
      </mo.li>
      <Arrow />
      <mo.li className="lp-flow-node lp-flow-node--final" {...pop()}>
        <span className="lp-flow-who" aria-hidden="true">
          {icon("M8 4h8v5a4 4 0 0 1-8 0V4M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8")}
        </span>
        <Phrase>{m.lp_flow_3()}</Phrase>
      </mo.li>
    </ol>
  );
}

function Arrow() {
  return (
    <li className="lp-flow-arrow" aria-hidden="true">
      <svg viewBox="0 0 24 24" width={22} height={22}>
        <path d="M12 4v15M6 13l6 6 6-6" className="ra-stroke" />
      </svg>
    </li>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="lp-section">
      <mo.h2 className="sh-display lp-h2" {...RISE}>
        <Phrase>{title}</Phrase>
      </mo.h2>
      {children}
    </section>
  );
}

/** 遊ぶ画面（トップ）へ進むボタン。 */
function Cta({ delay = 0 }: { delay?: number }) {
  return (
    <mo.div
      className="lp-cta"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...SPRING, delay }}
    >
      <mo.div whileHover={{ scale: 1.05, rotate: -1 }} whileTap={{ scale: 0.95 }}>
        <Link to="/" className="sh-btn sh-btn--primary lp-cta-btn">
          {m.lp_cta()}
        </Link>
      </mo.div>
      <span className="sh-sub">
        <Phrase>{m.lp_cta_note()}</Phrase>
      </span>
    </mo.div>
  );
}

/**
 * 点数の計算を試す。提出までの秒数を動かすと、1〜3 位の点が変わる。
 * 計算はゲームと同じ関数（shared/scoring）を使う。
 */
function ScoreDemo() {
  const [sec, setSec] = useState(12);
  const multiplier = speedMultiplier(sec * 1000, LIMIT_SEC * 1000);
  return (
    <div className="lp-score">
      <label className="lp-score-slider">
        <span>
          {m.lp_score_time({ sec })}
          <b className="lp-mult">×{formatMultiplier(multiplier)}</b>
        </span>
        <input
          type="range"
          min={0}
          max={LIMIT_SEC}
          value={sec}
          aria-valuetext={m.seconds({ count: sec })}
          onChange={(e) => setSec(Number(e.target.value))}
        />
      </label>
      <ul className="lp-score-bars">
        {BASE_POINTS.map((base, i) => {
          const points = Math.round(base * multiplier);
          return (
            <li key={base}>
              <span className="lp-score-rank">{m.rank_label({ rank: i + 1 })}</span>
              <span className="lp-score-track">
                <mo.span
                  className={`lp-score-fill lp-score-fill--${i + 1}`}
                  animate={{ width: `${(points / BASE_POINTS[0]) * 100}%` }}
                  transition={SPRING}
                />
              </span>
              <span className="lp-score-pts">{formatNumber(points)}</span>
            </li>
          );
        })}
      </ul>
      <div className="lp-streak">
        <p>
          <Phrase>{m.rules_6()}</Phrase>
        </p>
        <div className="lp-streak-chips">
          {[2, 3, 4, 5, 6].map((streak, i) => (
            <mo.span
              key={streak}
              className="lp-streak-chip"
              initial={{ opacity: 0, y: 14, scale: 0.6 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ ...SPRING, delay: i * 0.12 }}
            >
              +{formatNumber(streakBonus(streak))}
            </mo.span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 見出しの周りをゆっくり漂う飾りの丸と星。 */
function Floaters() {
  return (
    <div className="lp-floaters" aria-hidden="true">
      {["#ff9447", "#ffe36b", "#3d6bf0", "#7cc77a", "#ff9447", "#ffe36b"].map((color, i) => (
        <span key={i} className={`lp-floater lp-floater--${i}`} style={{ background: color }} />
      ))}
    </div>
  );
}

const icon = (d: string) => (
  <svg
    viewBox="0 0 24 24"
    width={30}
    height={30}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const FEATURES = [
  {
    icon: icon("M8 12.5l2.8 2.8L16 9.5M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"),
    title: m.lp_feat_1_title,
    body: m.lp_feat_1_body,
  },
  {
    icon: icon(
      "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M16 14.5a5 5 0 0 1 5 5.5",
    ),
    title: m.lp_feat_2_title,
    body: m.lp_feat_2_body,
  },
  {
    icon: icon(
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
    ),
    title: m.lp_feat_3_title,
    body: m.lp_feat_3_body,
  },
  {
    icon: icon("M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1M11 18h2"),
    title: m.lp_feat_4_title,
    body: m.lp_feat_4_body,
  },
];

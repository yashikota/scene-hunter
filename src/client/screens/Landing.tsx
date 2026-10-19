import { Link } from "@tanstack/react-router";
import * as mo from "motion/react-m";
import { useState, type ReactNode } from "react";
import { BASE_POINTS, speedMultiplier, streakBonus } from "../../shared/scoring";
import { m } from "../paraglide/messages";
import { formatMultiplier, formatNumber } from "../ui/format";
import { LanguageSelect } from "../ui/LanguageSelect";
import { useBrowserLocale } from "../ui/locale";
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
            {m.lp_tagline()}
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

      <Section title={m.lp_howto_title()}>
        <ol className="lp-steps">
          {Array.from({ length: RULE_STEPS }, (_, i) => (
            <mo.li key={i} className="lp-step" {...RISE}>
              <RulesArt step={i} />
              <h3 className="lp-step-title">
                <span className="sh-rule-num">{i + 1}</span>
                {titles[i]}
              </h3>
              <p className="lp-step-text">{rules[i]}</p>
            </mo.li>
          ))}
        </ol>
      </Section>

      <Section title={m.lp_score_title()}>
        <mo.div className="lp-card" {...RISE}>
          <p className="lp-lead">{m.lp_score_lead()}</p>
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
              <h3>{title()}</h3>
              <p>{body()}</p>
            </mo.li>
          ))}
        </ul>
      </Section>

      <mo.section className="lp-final" {...RISE}>
        <h2 className="sh-display">{m.lp_final_title()}</h2>
        <Cta />
      </mo.section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="lp-section">
      <mo.h2 className="sh-display lp-h2" {...RISE}>
        {title}
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
      <span className="sh-sub">{m.lp_cta_note()}</span>
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
        <p>{m.rules_6()}</p>
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

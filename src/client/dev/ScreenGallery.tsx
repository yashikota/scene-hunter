// 開発用：すべての画面を代表的な値で並べて見る（/__screens）。main.tsx から import.meta.env.DEV のときだけ読み込む。
// ?screen=<id>&lang=<locale> で 1 画面だけを出す（スクリーンショット用）。screen が無ければ一覧。
import { useState, type ReactNode } from "react";
import { isLocale, LOCALE_NAMES, LOCALES, type Locale } from "../../shared/locales";
import type { Total } from "../../shared/protocol";
import type { RoundScore } from "../../shared/scoring";
import { switchLocale } from "../ui/locale";
import { CameraBlocked } from "../screens/CameraBlocked";
import { Connecting } from "../screens/Connecting";
import { Disconnected } from "../screens/Disconnected";
import { Dissolved } from "../screens/Dissolved";
import { Final } from "../screens/Final";
import { GmTurn } from "../screens/GmTurn";
import { GmTurnPlayer } from "../screens/GmTurnPlayer";
import { HintError } from "../screens/HintError";
import { HintWait } from "../screens/HintWait";
import { LobbyGm } from "../screens/LobbyGm";
import { LobbyPlayer } from "../screens/LobbyPlayer";
import { PlayerSubmitted } from "../screens/PlayerSubmitted";
import { PlayerTurn } from "../screens/PlayerTurn";
import { PlayerTurnGm } from "../screens/PlayerTurnGm";
import { ResultsPick, type ResultPhotoView } from "../screens/ResultsPick";
import { ResultsReveal } from "../screens/ResultsReveal";
import { ResultsWait } from "../screens/ResultsWait";
import { Top, type TopDeps } from "../screens/Top";
import { Unsupported } from "../screens/Unsupported";
import { NameStep } from "../screens/NameStep";

const CODE = "482913";
const noop = () => {};
const never = () => new Promise<never>(() => {});
const neverDeps: TopDeps = { create: never, find: never };

/** 色の違う写真の代わり（SVG の data URL）。 */
const photo = (hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 70%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 60% 40%)"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="260" cy="120" r="50" fill="hsl(${(hue + 180) % 360} 70% 60%)"/></svg>`,
  )}`;

const NAMES = [
  "はるか",
  "そうた",
  "みお",
  "けんた",
  "あや",
  "Maximilianus",
  "ながいなまえのプレイヤー",
  "WWWWWWWWWWWW",
];
const members = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    pid: `p${i}`,
    label:
      i < NAMES.length
        ? NAMES[i]!
        : `${NAMES[i % NAMES.length]} (${Math.floor(i / NAMES.length) + 1})`,
  }));
const FEW = members(4);
const MANY = members(59); // GM と合わせて 60 人
const HINTS_JA = [
  "暖かい色が多い、落ち着いた場所",
  "近くに水がある",
  "見上げる角度で撮っている",
  "赤い看板の下に自転車が 2 台並んでいる",
  "駅前の商店街の入口にある、赤いアーチの真下",
];
const hints = (locale: Locale) =>
  locale === "ja"
    ? HINTS_JA
    : [
        "A calm place with mostly warm colours",
        "There is water nearby",
        "Shot from a low angle looking up",
        "Two bicycles side by side under a red sign",
        "Right under the red arch at the entrance of the shopping street by the station",
      ];

const photos = (n: number): ResultPhotoView[] =>
  members(n).map((p, i) => ({ ...p, url: photo(i * 47), valid: i !== 2 }));

const scores: RoundScore[] = [
  { pid: "p1", rank: 1, tMs: 12_000, multiplier: 0.9, points: 900, bonus: 200, streak: 3 },
  { pid: "p6", rank: 2, tMs: 6_000, multiplier: 0.95, points: 665, bonus: 0, streak: 1 },
  { pid: "p0", rank: 3, tMs: 31_000, multiplier: 0.74, points: 370, bonus: 0, streak: 1 },
  { pid: "p3", rank: null, tMs: 20_000, multiplier: null, points: 0, bonus: 0, streak: 0 },
];
const totals = (n: number): Total[] =>
  members(n).map((p, i) => ({
    pid: p.pid,
    total: Math.max(0, 2650 - i * 310),
    rank: i + 1,
    delta: [1, -1, 0, 2, -2][i % 5]!,
  }));

type Entry = { id: string; render(locale: Locale): ReactNode };

const ago = (ms: number) => Date.now() - ms;

export const ENTRIES: Entry[] = [
  { id: "top", render: () => <Top onEntered={noop} deps={neverDeps} /> },
  { id: "name-join", render: () => <NameStep code={CODE} onSubmit={never} onBack={noop} /> },
  { id: "name-create", render: () => <NameStep onSubmit={never} onBack={noop} /> },
  { id: "unsupported", render: () => <Unsupported /> },
  { id: "connecting", render: () => <Connecting /> },
  { id: "preparing", render: () => <Connecting preparing /> },
  { id: "claiming", render: () => <Connecting kind="claiming" /> },
  { id: "rejoining", render: () => <Connecting kind="rejoining" /> },
  { id: "claim-failed", render: () => <Connecting kind="claimFailed" onLeave={noop} /> },
  {
    id: "lobby-gm-empty",
    render: () => (
      <LobbyGm
        code={CODE}
        gmName="ゆうき"
        players={[]}
        rounds={3}
        limitSec={60}
        onStart={noop}
        onTransfer={never}
        onDissolve={noop}
        onRename={async () => {}}
      />
    ),
  },
  {
    id: "lobby-gm",
    render: () => (
      <LobbyGm
        code={CODE}
        gmName="ゆうき"
        players={FEW}
        rounds={3}
        limitSec={60}
        onStart={noop}
        onTransfer={never}
        onDissolve={noop}
        onRename={async () => {}}
      />
    ),
  },
  {
    id: "lobby-gm-60",
    render: () => (
      <LobbyGm
        code={CODE}
        gmName="ゆうき"
        players={MANY}
        rounds={3}
        limitSec={60}
        onStart={noop}
        onTransfer={never}
        onDissolve={noop}
        onRename={async () => {}}
      />
    ),
  },
  {
    id: "lobby-player",
    render: () => (
      <LobbyPlayer
        code={CODE}
        me={{ ...FEW[1]!, name: FEW[1]!.label }}
        onRename={async () => {}}
        gmName="ゆうき"
        players={FEW}
        rounds={3}
        limitSec={60}
        onLeave={noop}
      />
    ),
  },
  {
    id: "lobby-player-long",
    render: () => (
      <LobbyPlayer
        code={CODE}
        me={{ ...members(8)[6]!, name: members(8)[6]!.label }}
        onRename={async () => {}}
        gmName="Maximilianus"
        players={members(8)}
        rounds={3}
        limitSec={60}
        onLeave={noop}
      />
    ),
  },
  { id: "gm-turn", render: () => <GmTurn round={2} rounds={3} onPhoto={never} /> },
  {
    id: "gm-turn-player",
    render: () => (
      <GmTurnPlayer
        code={CODE}
        round={2}
        rounds={3}
        gmName="ながいなまえのプレイヤー"
        me={{ label: "そうた", total: 1520, rank: 2 }}
      />
    ),
  },
  { id: "hint-wait", render: () => <HintWait code={CODE} round={2} rounds={3} /> },
  {
    id: "hint-error",
    render: () => <HintError round={2} rounds={3} onRetry={never} onDissolve={noop} />,
  },
  {
    id: "player-turn",
    render: (l) => (
      <PlayerTurn
        code={CODE}
        round={2}
        rounds={3}
        limitSec={60}
        turnStartedLocalAt={ago(24_000)}
        hints={hints(l).slice(0, 3)}
        submitted={false}
        submittedCount={2}
        playerCount={4}
        onShutter={never}
      />
    ),
  },
  {
    id: "player-turn-gm",
    render: (l) => (
      <PlayerTurnGm
        round={2}
        rounds={3}
        limitSec={60}
        turnStartedLocalAt={ago(24_000)}
        hints={hints(l)}
        shown={3}
        photoUrl={photo(200)}
        players={FEW}
        submitted={["p0", "p2"]}
      />
    ),
  },
  {
    id: "player-turn-gm-60",
    render: (l) => (
      <PlayerTurnGm
        round={2}
        rounds={3}
        limitSec={60}
        turnStartedLocalAt={ago(44_000)}
        hints={hints(l)}
        shown={5}
        photoUrl={photo(200)}
        players={MANY}
        submitted={MANY.slice(0, 40).map((p) => p.pid)}
      />
    ),
  },
  {
    id: "player-submitted",
    render: () => (
      <PlayerSubmitted
        round={2}
        rounds={3}
        startedAt={ago(39_000)}
        limitSec={60}
        photoUrl={photo(30)}
        submitted={2}
        total={4}
      />
    ),
  },
  {
    id: "results-pick-checking",
    render: () => (
      <ResultsPick
        round={2}
        rounds={3}
        gmPhotoUrl={photo(200)}
        photos={null}
        missing={[]}
        picks={[]}
        onToggle={noop}
        onConfirm={noop}
      />
    ),
  },
  {
    id: "results-pick",
    render: () => (
      <ResultsPick
        round={2}
        rounds={3}
        gmPhotoUrl={photo(200)}
        photos={photos(7)}
        missing={["WWWWWWWWWWWW"]}
        picks={["p1", "p6"]}
        onToggle={noop}
        onConfirm={noop}
      />
    ),
  },
  {
    id: "results-pick-none",
    render: () => (
      <ResultsPick
        round={2}
        rounds={3}
        gmPhotoUrl={photo(200)}
        photos={[]}
        missing={["そうた", "はるか"]}
        picks={[]}
        onToggle={noop}
        onConfirm={noop}
      />
    ),
  },
  {
    id: "results-wait-none",
    render: () => (
      <ResultsWait
        code={CODE}
        round={2}
        rounds={3}
        gmName="ゆうき"
        gmPhotoUrl={photo(200)}
        photos={[]}
        mePid="p1"
      />
    ),
  },
  {
    id: "results-wait",
    render: () => (
      <ResultsWait
        code={CODE}
        round={2}
        rounds={3}
        gmName="ゆうき"
        gmPhotoUrl={photo(200)}
        photos={photos(7)}
        mePid="p1"
      />
    ),
  },
  {
    id: "results-wait-collecting",
    render: () => (
      <ResultsWait code={CODE} round={2} rounds={3} gmName="ゆうき" photos={null} mePid="p1" />
    ),
  },
  ...[true, false].map((isGm) => ({
    id: isGm ? "results-reveal-gm" : "results-reveal",
    render: () => (
      <ResultsReveal
        code={CODE}
        round={2}
        rounds={3}
        scores={scores}
        totals={totals(8)}
        players={members(8)}
        photoUrls={Object.fromEntries(photos(8).map((p) => [p.pid, p.url]))}
        mePid="p3"
        isGm={isGm}
        onNext={noop}
      />
    ),
  })),
  ...[true, false].map((isGm) => ({
    id: isGm ? "final-gm" : "final",
    render: () => (
      <Final
        code={CODE}
        rounds={3}
        totals={totals(8)}
        players={members(8)}
        mePid="p6"
        isGm={isGm}
        onBackToLobby={noop}
        onLeave={noop}
      />
    ),
  })),
  {
    id: "disconnected",
    render: () => (
      <Disconnected
        code={CODE}
        round={2}
        rounds={3}
        gmName="ゆうき"
        since={ago(75_000)}
        me={{ rank: 2, total: 1520 }}
        onLeave={noop}
      />
    ),
  },
  { id: "dissolved", render: () => <Dissolved code={CODE} onLeave={noop} /> },
  { id: "camera-denied", render: () => <CameraBlocked reason="denied" onRetry={noop} /> },
  { id: "camera-unavailable", render: () => <CameraBlocked reason="unavailable" onRetry={noop} /> },
];

/** Top は navigator.languages から言語を決めるので、指定した言語を先頭にしておく。 */
function forceLocale(locale: Locale) {
  Object.defineProperty(navigator, "languages", { configurable: true, get: () => [locale] });
  switchLocale(locale);
}

export function ScreenGallery() {
  const params = new URLSearchParams(location.search);
  const lang = params.get("lang");
  const locale: Locale = isLocale(lang) ? lang : "ja";
  const [ready] = useState(() => (forceLocale(locale), true));
  const id = params.get("screen");
  const entry = ENTRIES.find((e) => e.id === id);
  if (!ready) return null;
  if (entry) return <>{entry.render(locale)}</>;
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: 20,
        fontFamily: "var(--font-body), sans-serif",
      }}
    >
      <h1 className="sh-display" style={{ fontSize: 24 }}>
        Screens
      </h1>
      <p>
        {LOCALES.map((l) => (
          <a
            key={l}
            href={`?lang=${l}`}
            style={{ marginRight: 10, fontWeight: l === locale ? 800 : 400 }}
          >
            {LOCALE_NAMES[l]}
          </a>
        ))}
      </p>
      <ul>
        {ENTRIES.map((e) => (
          <li key={e.id}>
            <a href={`?screen=${e.id}&lang=${locale}`}>{e.id}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}

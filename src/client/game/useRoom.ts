import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { importPrivateKey, sha256Hex } from '../../shared/crypto';
import { EnvelopeVerifier } from '../../shared/envelope';
import * as api from '../api';
import { createMoqNetConnector, type MoqConnector } from '../moq/session';
import { uploadPhoto } from '../photo/upload';
import { switchLocale } from '../ui/locale';
import { useWakeLock } from '../ui/useWakeLock';
import type { GmAction, GmState } from './gmMachine';
import { forgetGm, GmEngine } from './gmEngine';
import { hintsToResume, requestHintsAction } from './hintRequest';
import { claimUntilDone, clearMe, loadMe, rejoinUntilDone, saveMe, type Me } from './membership';
import { checkRoundPhotos } from './photoCheck';
import { PlayerEngine } from './playerEngine';
import { initialView, type PlayerView } from './playerView';

// 部屋の画面が使う 1 つの入り口。役割（GM / プレイヤー）に応じて GmEngine か PlayerEngine を回し、
// 画面には同じ形の表示モデル（PlayerView）と操作（actions）を渡す。
//
// 写真とヒントのうち、ここで受け持つのは「撮った写真（JPEG の Blob）を受け取ってから先」：
// - GM：アップロード → gmPhotoUploaded → ヒントの生成 → hintsReady / hintsFailed（retryHints でやり直し）
// - プレイヤー：SHA-256 → shutter を送る → アップロード → submit を送る
// - GM：picking に入ったら、写真を集めてハッシュを確かめ（photoChecked）、results を送る（resultsReady）
// カメラと JPEG への変換（Task 16）は画面側で足す。

export interface RoomActions {
  start(): void;
  /** 撮った写真（encodeJpeg 済み）を出す。GM はお題、プレイヤーは提出。失敗は reject する。 */
  shutter(blob: Blob): Promise<void>;
  /** GM：ヒントの生成に失敗した後にやり直す。 */
  retryHints(): Promise<void>;
  pickToggle(pid: string): void;
  confirmPicks(): void;
  nextRound(): void;
  backToLobby(): void;
  /** GM：ロビーで GM を渡す。渡した後は新しい pid のプレイヤーとして入り直す。 */
  transfer(pid: string): Promise<void>;
  /** GM：解散のイベントを流してから部屋を閉じ、トップに戻る。 */
  dissolve(): Promise<void>;
  /** プレイヤー：部屋を出てトップに戻る（GM は解散）。 */
  leave(): Promise<void>;
}

export interface Room {
  role: 'gm' | 'player';
  me: { pid: string; label: string };
  /** GM の名前（参加証の名前）。まだ分からなければ空文字。 */
  gmName: string;
  view: PlayerView;
  gm?: { state: GmState; dispatch(a: GmAction): void };
  /**
   * GM の交代の途中なら、その段階（この間は部屋の画面の代わりに待ちの画面を出す）。
   * claiming：交代先として GM の参加証を取り直している。rejoining：GM を渡し、プレイヤーとして入り直している。
   * claimFailed：取り直せなかった（部屋が無い、交代証の期限切れなど）。
   */
  status: 'claiming' | 'rejoining' | 'claimFailed' | null;
  /** プレイヤー：GM の接続が切れたと判断した時刻（ミリ秒）。つながっている間は null。 */
  gmDisconnectedSince: number | null;
  /** 自分の接続が切れて、3 秒以上つなぎ直せていない（つなぎ直しは自動）。 */
  reconnecting: boolean;
  actions: RoomActions;
}

/** 解散のイベントが Relay に届くのを待ってから部屋を閉じる。 */
const DISSOLVE_LINGER_MS = 5000;
/** GM を渡した後、交代のイベントが届くまで古い GM の接続を残す。 */
const TRANSFER_LINGER_MS = 5000;
/** 部屋を出た後、leave が Relay に届くまでプレイヤーの接続を残す。 */
const LEAVE_LINGER_MS = 3000;

const serverPub = (): string => import.meta.env.VITE_SERVER_PUBLIC_KEY ?? '';
const nowMs = () => Date.now();
/** 写真の取得が応答なしで止まったときにあきらめるまでの時間。 */
const PHOTO_TIMEOUT_MS = 10_000;

/** start に渡す GameId：16 文字の小文字の 16 進数。 */
export function newGameId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

type Engine = { kind: 'gm'; gm: GmEngine } | { kind: 'player'; player: PlayerEngine };

export function useRoom(code: string, connector: MoqConnector = defaultConnector()): Room {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me>(() => {
    const m = loadMe(code);
    if (!m) throw new Error(`no membership for room ${code}`);
    // 部屋の言語は、入った時点の値で先に切り替えておく（つなぐまでの画面もその言語で出す）。
    switchLocale(m.locale);
    return m;
  });
  const [engine, setEngine] = useState<Engine | null>(null);
  const [claimFailed, setClaimFailed] = useState(false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  /** 閉じるときに待つ時間（解散の直後だけ）。 */
  const linger = useRef(0);
  /** shutter イベントを送り終えた写真。送り直しでは shutter を再送せず、アップロードと submit だけやり直す。 */
  const shuttered = useRef(new WeakSet<Blob>());
  const meRef = useRef(me);
  meRef.current = me;

  /** 資格を保存して画面の me にも反映する。seq は保存したものが最新なので、それを引き継ぐ。 */
  const updateMe = useCallback(
    (patch: (cur: Me) => Me) => {
      const next = patch(loadMe(code) ?? meRef.current);
      saveMe(next);
      setMe(next);
    },
    [code],
  );

  const exit = useCallback(() => {
    clearMe(code);
    void navigate({ to: '/' });
  }, [code, navigate]);

  const pending = me.pending;
  // 入り直しの最中は MoQ を使わない（GM の接続は交代のときに閉じた）。
  const rejoining = pending?.kind === 'rejoin';

  useEffect(() => {
    if (rejoining) {
      setEngine(null);
      return;
    }
    let cancelled = false;
    let made: Engine | null = null;
    const start = async () => {
      const privateKey = await importPrivateKey(me.privateKey);
      if (cancelled) return;
      const verifier = new EnvelopeVerifier(serverPub(), code, () => Math.floor(nowMs() / 1000));
      if (me.role === 'gm') {
        const gm = new GmEngine(me, { connector, verifier, privateKey, now: nowMs });
        gm.subscribe(rerender);
        // 交代先として GM になったときは、前の GM の epoch を越える
        gm.start(meRef.current.gmEpochFloor ?? 0);
        made = { kind: 'gm', gm };
      } else {
        // 使った seq は保存した方に入っている（state の me は seq を更新しない）
        const player: PlayerEngine = new PlayerEngine(loadMe(code) ?? me, {
          connector,
          verifier,
          privateKey,
          serverPub: serverPub(),
          now: nowMs,
          saveSeq: (seq) => saveMe({ ...(loadMe(code) ?? meRef.current), seq }),
          saveGmPid: (gmPid) => saveMe({ ...(loadMe(code) ?? meRef.current), gmPid }),
          onTransferToMe: (transfer) =>
            updateMe((cur) =>
              cur.pending?.kind === 'claim'
                ? cur
                : { ...cur, pending: { kind: 'claim', transfer, fromEpoch: player.epoch } },
            ),
        });
        player.subscribe(rerender);
        player.start();
        made = { kind: 'player', player };
      }
      setEngine(made);
    };
    // StrictMode の付け外しで epoch を無駄に進めないよう、次の tick で始める。
    const timer = setTimeout(() => {
      start().catch((e: unknown) => {
        // 保存した資格が壊れている（鍵を読み込めないなど）。入り直してもらう。
        console.error('部屋につなげなかった', e);
        if (!cancelled) exit();
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (made?.kind === 'gm') made.gm.close(linger.current);
      if (made?.kind === 'player') made.player.close(linger.current);
      linger.current = 0;
    };
  }, [code, me.role, me.pid, me.privateKey, rejoining, connector, updateMe, exit]);

  // 交代先に選ばれたら、交代証で GM の参加証を取り直す（再読み込みしても保存した交代証で続ける）。
  useEffect(() => {
    if (pending?.kind !== 'claim') return;
    let stopped = false;
    const timer = setTimeout(() => {
      claimUntilDone(loadMe(code) ?? meRef.current, pending, { stopped: () => stopped })
        .then((next) => {
          if (stopped) return;
          if (next) return updateMe(() => ({ ...next, gmEpochFloor: pending.fromEpoch }));
          updateMe((cur) => ({ ...cur, pending: undefined }));
          setClaimFailed(true);
        })
        .catch((e: unknown) => console.error('GM を引き継げなかった', e));
    }, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, code, updateMe]);

  // GM を渡した後は、新しい鍵でプレイヤーとして入り直す（入れるまで間隔を伸ばしながら）。
  useEffect(() => {
    if (pending?.kind !== 'rejoin') return;
    let stopped = false;
    const timer = setTimeout(() => {
      rejoinUntilDone(loadMe(code) ?? meRef.current, { stopped: () => stopped })
        .then((next) => {
          if (stopped) return;
          if (!next) return exit();
          // サーバーの記録はまだ交代先の claim 前のこともあるので、自分が渡した交代先に従う
          updateMe(() => ({ ...next, gmPid: pending.gmPid }));
        })
        .catch((e: unknown) => console.error('プレイヤーとして入り直せなかった', e));
    }, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, code, updateMe, exit]);

  const gm = engine?.kind === 'gm' ? engine.gm : undefined;
  const player = engine?.kind === 'player' ? engine.player : undefined;
  const gmState = gm?.state;
  const playerView = player?.view;
  const view = useMemo(
    () => (gm ? gm.view() : (playerView ?? initialView())),
    // gm.view() は gm.state から作るので、gmState が変わったら作り直す
    [gm, gmState, playerView],
  );

  // GM：ゲームの間は画面を消さない（GM の端末が止まると、撮影の時刻とヒントが狂う）。
  useWakeLock(gmState !== undefined && gmState.phase !== 'lobby' && !gmState.dissolved);

  // 部屋の言語を lobby で受け取ったら、画面をその言語にする。
  const roomLocale = view.phase === 'connecting' ? me.locale : view.locale;
  const [appliedLocale, setAppliedLocale] = useState(me.locale);
  useEffect(() => {
    if (roomLocale === appliedLocale) return;
    switchLocale(roomLocale);
    setAppliedLocale(roomLocale);
  }, [roomLocale, appliedLocale]);

  // GM：picking に入ったら（results がまだ無ければ）写真を確かめて results を送る。
  const checkKey =
    gmState?.phase === 'picking' && gmState.results === null
      ? `${gmState.gameId}:${gmState.round}`
      : null;
  useEffect(() => {
    if (!gm || checkKey === null) return;
    let stopped = false;
    const s = gm.state;
    checkRoundPhotos(s, {
      listPhotos: (query) => api.listPhotos(code, meRef.current.roomToken, query),
      fetchBytes: async (url) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`photo ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      },
      sha256Hex,
      dispatch: (a) => gm.dispatch(a),
      stopped: () => stopped,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    }).catch((e: unknown) => console.error('写真を確かめられなかった', e));
    return () => {
      stopped = true;
    };
  }, [gm, checkKey, code]);

  // GM：再読み込みで hinting のまま戻ったら、ヒントを頼み直す（前の依頼は再読み込みで消えた）。
  const resumed = useRef(new WeakSet<GmEngine>());
  useEffect(() => {
    if (!gm || resumed.current.has(gm)) return;
    resumed.current.add(gm);
    const key = hintsToResume(gm.state);
    if (key === null) return;
    void requestHintsAction(() => api.requestHints(code, meRef.current.roomToken, key), nowMs).then(
      (a) => gm.dispatch(a),
    );
  }, [gm, code]);

  const actions = useMemo<RoomActions>(() => {
    const dispatch = (a: GmAction) => gm?.dispatch(a);
    const uploader = (token: string) => ({
      requestUpload: (input: { gameId: string; round: number; size: number }) =>
        api.requestUpload(code, token, input),
    });
    const askHints = async (key: string) =>
      dispatch(await requestHintsAction(() => api.requestHints(code, me.roomToken, key), nowMs));
    const dissolve = async () => {
      if (!gm) return;
      gm.dispatch({ type: 'dissolve' });
      await gm.flush();
      linger.current = DISSOLVE_LINGER_MS;
      try {
        await api.closeRoom(code, me.roomToken);
      } catch (e) {
        // 部屋の後始末は cron と有効期限でも行われるので、トップには戻す。
        console.error('部屋を閉じられなかった', e);
      }
      forgetGm(code);
      exit();
    };
    return {
      start: () => dispatch({ type: 'start', gameId: newGameId() }),
      shutter: async (blob) => {
        if (gm) {
          const s = gm.state;
          if (s.phase !== 'gmTurn' || !s.gameId) return;
          const key = await uploadPhoto(uploader(me.roomToken), blob, {
            gameId: s.gameId,
            round: s.round,
          });
          gm.dispatch({ type: 'gmPhotoUploaded', key });
          await askHints(key);
        } else if (player) {
          const { round, gameId } = player.view;
          if (!gameId) return;
          if (!shuttered.current.has(blob)) {
            const hash = await sha256Hex(new Uint8Array(await blob.arrayBuffer()));
            player.send({ type: 'shutter', round, hash });
            shuttered.current.add(blob);
          }
          const key = await uploadPhoto(uploader(me.roomToken), blob, { gameId, round });
          player.send({ type: 'submit', round, key });
        }
      },
      retryHints: async () => {
        const key = gm?.state.gmPhotoKey;
        if (!gm || gm.state.phase !== 'hintError' || !key) return;
        gm.dispatch({ type: 'retryHints' });
        await askHints(key);
      },
      pickToggle: (pid) => dispatch({ type: 'togglePick', pid }),
      confirmPicks: () => dispatch({ type: 'confirmPicks' }),
      nextRound: () => dispatch({ type: 'nextRound' }),
      backToLobby: () => dispatch({ type: 'backToLobby' }),
      transfer: async (pid) => {
        if (!gm || gm.state.phase !== 'lobby') return;
        const cert = await api.transfer(code, me.roomToken, pid);
        gm.dispatch({ type: 'transferred', transfer: cert });
        await gm.flush();
        // 交代のイベントを流したら GM としては何もしない（接続は交代のイベントが届くよう少し残して閉じる）。
        // 先に閉じるので、この後に状態や epoch が書き戻されることも無い。
        gm.close(TRANSFER_LINGER_MS);
        forgetGm(code);
        // GM の参加証のままではプレイヤーになれないので、新しい鍵で入り直す（再読み込みしても続ける）。
        updateMe((cur) => ({ ...cur, pending: { kind: 'rejoin', gmPid: pid } }));
      },
      dissolve,
      leave: async () => {
        if (gm) return dissolve();
        if (player) {
          // GM に出たことを知らせ、届くまで少し接続を残す（閉じるのは画面を離れたとき）。
          player.leave();
          linger.current = LEAVE_LINGER_MS;
        }
        exit();
      },
    };
  }, [gm, player, code, me.roomToken, exit, updateMe]);

  const label =
    me.role === 'gm' ? me.name : (view.players.find((p) => p.pid === me.pid)?.label ?? me.name);
  const status = claimFailed
    ? 'claimFailed'
    : pending?.kind === 'claim'
      ? 'claiming'
      : pending?.kind === 'rejoin'
        ? 'rejoining'
        : null;
  return {
    role: me.role,
    me: { pid: me.pid, label },
    gmName: gm ? me.name : (player?.gmName() ?? ''),
    view,
    gm: gm && { state: gm.state, dispatch: (a) => gm.dispatch(a) },
    status,
    gmDisconnectedSince: player?.gmDisconnectedSince ?? null,
    reconnecting: (gm ?? player)?.reconnecting ?? false,
    actions,
  };
}

let sharedConnector: MoqConnector | undefined;
function defaultConnector(): MoqConnector {
  sharedConnector ??= createMoqNetConnector();
  return sharedConnector;
}

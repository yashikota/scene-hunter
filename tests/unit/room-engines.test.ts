// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  GM_GROUP_MAX_FRAMES,
  GmEngine,
  PRESENCE_FLIP_MIN_MS,
} from "../../src/client/game/gmEngine";
import { GM_EVENTS_MAX_AGE_MS } from "../../src/client/moq/follow";
import { claimUntilDone, loadMe, rejoinUntilDone, type Me } from "../../src/client/game/membership";
import {
  PlayerEngine,
  GROUP_MAX_FRAMES,
  REJOIN_AFTER_MS,
  SEQ_BLOCK,
  TRANSFER_GRACE_MS,
} from "../../src/client/game/playerEngine";
import { newGameId } from "../../src/client/game/useRoom";
import { issueCert, issueTransfer, type Cert } from "../../src/shared/cert";
import { FakeRelay, flush } from "./fakeMoq";
import { PLAYER_TRACK_MAX_AGE_MS } from "../../src/client/moq/gmInbox";
import { makeIdentities, ROOM } from "./moqKeys";
import { encodeFrame } from "../../src/client/game/wire";
import { seal } from "../../src/shared/envelope";

type Identity = Awaited<ReturnType<Awaited<ReturnType<typeof makeIdentities>>["mk"]>>;

const meOf = (id: Identity, role: "gm" | "player", seq = 0): Me => ({
  code: ROOM,
  pid: id.cert.body.pid,
  name: id.cert.body.name,
  role,
  roomToken: "t",
  cert: id.cert as Cert,
  privateKey: "",
  pubkey: id.cert.body.pubkey,
  moqUrl: "https://relay/x",
  locale: "ja",
  rounds: 3,
  limitSec: 60,
  seq,
});

async function setup() {
  const keys = await makeIdentities();
  const relay = new FakeRelay();
  const gmId = await keys.mk("gm", "gm");
  const aliceId = await keys.mk("alice", "player");
  const startGm = () => {
    const gm = new GmEngine(meOf(gmId, "gm"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: gmId.kp.privateKey,
      now: () => Date.now(),
    });
    gm.start();
    return gm;
  };
  const startPlayer = (seq = 0) => {
    const saved: number[] = [];
    const p = new PlayerEngine(meOf(aliceId, "player", seq), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: aliceId.kp.privateKey,
      serverPub: "",
      now: () => Date.now(),
      saveSeq: (n) => saved.push(n),
      saveGmPid: () => {},
      onTransferToMe: () => {},
    });
    p.start();
    return { p, saved };
  };
  return { relay, startGm, startPlayer };
}

const read = (key: string) => JSON.parse(localStorage.getItem(key) ?? "null");

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("GmEngine", () => {
  it("epoch は 1 から始まり、再開のたびに 1 つ上がり、イベントの seq は続きから数える", async () => {
    const { startGm } = await setup();
    const a = startGm();
    expect(a.epoch).toBe(1);
    a.dispatch({ type: "playerJoined", pid: "p1", name: "A", at: 0 }); // lobby イベント（seq 0）
    await a.flush();
    a.close();
    expect(read(`sh:gmlink:${ROOM}`)).toMatchObject({ epoch: 1, eventSeq: 0 });

    const b = startGm();
    expect(b.epoch).toBe(2);
    // 保存した状態から戻る
    expect(Object.keys(b.state.players)).toEqual(["p1"]);
    b.dispatch({ type: "playerJoined", pid: "p2", name: "B", at: 0 });
    await b.flush();
    b.close();
    expect(read(`sh:gmlink:${ROOM}`)).toMatchObject({ epoch: 2, eventSeq: 1 });
  });

  it("再開した GM は、ゲームの途中で出た人の p/{pid} を購読しない", async () => {
    const { relay, startGm } = await setup();
    const a = startGm();
    a.dispatch({ type: "playerJoined", pid: "p1", name: "A", at: 0 });
    a.dispatch({ type: "playerJoined", pid: "p2", name: "B", at: 0 });
    a.dispatch({ type: "start", gameId: "g1" });
    a.dispatch({ type: "playerLeft", pid: "p1" });
    expect(Object.keys(a.state.players)).toEqual(["p1", "p2"]); // 得点のため一覧には残る
    await a.flush();
    a.close();
    const before = relay.connections.length;
    const b = startGm();
    await vi.waitFor(() =>
      expect(relay.connections.slice(before).flatMap((c) => c.subscribes)).not.toEqual([]),
    );
    const paths = relay.connections.slice(before).flatMap((c) => c.subscribes.map((x) => x.path));
    expect(paths).toContain("p/p2");
    expect(paths).not.toContain("p/p1");
    b.close();
  });

  it("GM を引き継ぐときは前の GM の epoch を越える", async () => {
    const { startGm } = await setup();
    const gm = startGm();
    gm.close();
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    const id = await keys.mk("bob", "gm");
    const next = new GmEngine(meOf(id, "gm"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: id.kp.privateKey,
      now: () => Date.now(),
    });
    next.start(7);
    expect(next.epoch).toBe(8);
    next.close();
  });

  it("GameId は 16 文字の小文字の 16 進数", () => {
    expect(newGameId()).toMatch(/^[0-9a-f]{16}$/);
    expect(newGameId()).not.toBe(newGameId());
  });
});

describe("GM とプレイヤー（偽の Relay）", () => {
  it("プレイヤーが入ると GM の一覧に載り、プレイヤーの画面もロビーになる", async () => {
    const { startGm, startPlayer } = await setup();
    const gm = startGm();
    const { p, saved } = startPlayer();
    await vi.waitFor(() => expect(gm.state.players.alice?.label).toBe("alice"));
    await vi.waitFor(() => expect(p.view.phase).toBe("lobby"));
    await vi.waitFor(() => expect(p.view.players.map((x) => x.pid)).toEqual(["alice"]));
    expect(p.gmName()).toBe("gm");
    expect(saved).toEqual([SEQ_BLOCK]); // join で seq 0 を使い、SEQ_BLOCK 個先まで確保した
    p.close();
    gm.close();
  });

  it("再読み込みしたプレイヤーは保存した seq から続け、GM に捨てられない", async () => {
    const { startGm, startPlayer } = await setup();
    const gm = startGm();
    const first = startPlayer();
    await vi.waitFor(() => expect(first.p.view.phase).toBe("lobby"));
    gm.dispatch({ type: "start", gameId: "g1" });
    gm.dispatch({ type: "gmPhotoUploaded", key: "k" });
    gm.dispatch({ type: "hintsReady", hints: ["a", "b", "c", "d", "e"], at: Date.now() });
    await vi.waitFor(() => expect(first.p.view.phase).toBe("playerTurn"));
    first.p.close();

    const second = startPlayer(first.saved.at(-1));
    await vi.waitFor(() => expect(second.p.view.phase).toBe("playerTurn"));
    second.p.send({ type: "shutter", round: 1, hash: "h" });
    await vi.waitFor(() => expect(gm.state.shutters.alice?.hash).toBe("h"));
    second.p.close();
    gm.close();
  });

  it("GM のイベントはスナップショットの lastEventSeq と揃い、取りこぼしが無ければ resync を送らない", async () => {
    const { relay, startGm, startPlayer } = await setup();
    const gm = startGm();
    const { p } = startPlayer();
    await vi.waitFor(() => expect(p.view.players).toHaveLength(1));
    gm.dispatch({ type: "start", gameId: "g1" });
    await vi.waitFor(() => expect(p.view.phase).toBe("gmTurn"));
    expect(p.view.lastSeq).toBe(read(`sh:gmlink:${ROOM}`).eventSeq);
    // 送ったのは join だけ（resync は無い）
    const sent = relay.tracks.get("p/alice#events")!.groups.flat();
    expect(sent).toHaveLength(1);
    p.close();
    gm.close();
  });

  it("GM の events は lobby と gm_turn の前と GM_GROUP_MAX_FRAMES ごとに区切り、プレイヤーは区切りをまたいで取りこぼさない", async () => {
    const { relay, startGm, startPlayer } = await setup();
    const gm = startGm();
    const { p } = startPlayer();
    await vi.waitFor(() => expect(p.view.players).toHaveLength(1));
    // ロビーの出入りのたびの lobby は、1 つずつ新しいグループになる（届き直すのは最新の 1 つだけ）
    for (let i = 0; i < 5; i++)
      gm.dispatch({ type: "playerJoined", pid: `x${i}`, name: "x", at: 0 });
    gm.dispatch({ type: "start", gameId: "g1" });
    gm.dispatch({ type: "gmPhotoUploaded", key: "k" });
    // 区切りの数を超えるイベント（hint_error と hinting を交互に）
    for (let i = 0; i < GM_GROUP_MAX_FRAMES; i++) {
      gm.dispatch({ type: "hintsFailed" });
      gm.dispatch({ type: "retryHints" });
    }
    await gm.flush();
    const groups = relay.tracks.get("gm/1#events")!.groups;
    const types = groups.map((g) =>
      g.map(
        (b) => (JSON.parse(new TextDecoder().decode(b)) as { body: { type: string } }).body.type,
      ),
    );
    const toggles = Array.from({ length: 2 * GM_GROUP_MAX_FRAMES }, (_, i) =>
      i % 2 ? "hinting" : "hint_error",
    );
    expect(types.slice(0, 7)).toEqual([
      ["lobby"], // alice
      ["lobby"],
      ["lobby"],
      ["lobby"],
      ["lobby"],
      ["lobby"],
      ["gm_turn", "hinting", ...toggles.slice(0, GM_GROUP_MAX_FRAMES - 2)],
    ]);
    expect(Math.max(...groups.map((g) => g.length))).toBe(GM_GROUP_MAX_FRAMES);
    expect(groups.flat()).toHaveLength(6 + 2 + 2 * GM_GROUP_MAX_FRAMES);
    // プレイヤーは区切りをまたいで全部受け取り、resync を送らない
    await vi.waitFor(() => expect(p.view.lastSeq).toBe(read(`sh:gmlink:${ROOM}`).eventSeq));
    expect(p.view.phase).toBe("hinting");
    expect(relay.tracks.get("p/alice#events")!.groups.flat()).toHaveLength(1);
    // 区切りの直前のフレームを読み捨てないよう、events は古いグループも読み切る
    const eventsSubs = relay.connections
      .flatMap((c) => c.subscribes)
      .filter((x) => x.path === "gm/1" && x.track === "events");
    expect(eventsSubs.length).toBeGreaterThan(0);
    expect(eventsSubs.every((x) => x.maxAgeMs === GM_EVENTS_MAX_AGE_MS)).toBe(true);
    p.close();
    gm.close();
  });

  it("解散の後に届くものでロビーに戻らない", async () => {
    const { startGm, startPlayer } = await setup();
    const gm = startGm();
    const { p } = startPlayer();
    await vi.waitFor(() => expect(p.view.phase).toBe("lobby"));
    gm.dispatch({ type: "dissolve" });
    await vi.waitFor(() => expect(p.view.phase).toBe("dissolved"));
    // 解散した GM は以後スナップショットを書かない
    const before = read(`sh:gmlink:${ROOM}`).snapshotSeq;
    gm.dispatch({ type: "playerJoined", pid: "x", name: "x", at: 0 });
    expect(read(`sh:gmlink:${ROOM}`).snapshotSeq).toBe(before);
    expect(p.view.phase).toBe("dissolved");
    p.close();
    gm.close();
  });
});

describe("GM の交代（偽の Relay）", () => {
  it("transfer イベントで全員が交代先に従い、交代先は claim をやり直して新しい epoch で GM になる", async () => {
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    const gmId = await keys.mk("gm", "gm");
    const aliceId = await keys.mk("alice", "player");
    const bobId = await keys.mk("bob", "player");
    const now = () => Date.now();
    const gm = new GmEngine(meOf(gmId, "gm"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: gmId.kp.privateKey,
      now,
    });
    gm.start();
    const transfers: unknown[] = [];
    const pinned: string[] = [];
    const player = (id: Identity) => {
      const p = new PlayerEngine(meOf(id, "player"), {
        connector: relay.connector,
        verifier: keys.verifier(),
        privateKey: id.kp.privateKey,
        serverPub: keys.serverPub,
        now,
        saveSeq: () => {},
        saveGmPid: (pid) => pinned.push(`${id.cert.body.pid}:${pid}`),
        onTransferToMe: (t) => transfers.push(t),
      });
      p.start();
      return p;
    };
    const alice = player(aliceId);
    const bob = player(bobId);
    await vi.waitFor(() => expect(Object.keys(gm.state.players).sort()).toEqual(["alice", "bob"]));
    await vi.waitFor(() => expect(bob.view.players).toHaveLength(2));
    expect(bob.gmPid).toBe("gm");

    const nowSec = Math.floor(Date.now() / 1000);
    const transfer = await issueTransfer(keys.server.privateKey, {
      room: ROOM,
      from: "gm",
      to: "alice",
      iat: nowSec,
      exp: nowSec + 600,
    });
    gm.dispatch({ type: "transferred", transfer });
    await gm.flush();
    await vi.waitFor(() => expect(transfers).toEqual([transfer]));
    await vi.waitFor(() => expect(bob.gmPid).toBe("alice"));
    expect(bob.view.lastSeq).toBe(-1); // 新しい GM の seq は 0 から
    // 交代先は保存して、再読み込みしても交代先だけに従う
    expect(pinned.sort()).toEqual(["alice:alice", "bob:alice"]);
    gm.close();

    // 1 回目の claim は通信の失敗。やり直しで GM の参加証を受け取る。
    const gmCert = await issueCert(keys.server.privateKey, { ...aliceId.cert.body, role: "gm" });
    const claim = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("unavailable"), { status: 503 }))
      .mockResolvedValueOnce({ roomToken: "t2", cert: gmCert });
    const sleeps: number[] = [];
    const fromEpoch = alice.epoch;
    expect(fromEpoch).toBe(1);
    const next = await claimUntilDone(
      meOf(aliceId, "player"),
      { kind: "claim", transfer, fromEpoch },
      { claim, retry: { sleep: async (ms) => void sleeps.push(ms), nowSec: () => nowSec } },
    );
    expect(claim).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([1000]);
    expect(next).toMatchObject({ role: "gm", roomToken: "t2", pid: "alice" });
    alice.close();

    const newGm = new GmEngine(next!, {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: aliceId.kp.privateKey,
      now,
    });
    newGm.start(fromEpoch);
    expect(newGm.epoch).toBe(2);
    await vi.waitFor(() => expect(bob.epoch).toBe(2));
    await vi.waitFor(() => expect(bob.view.gmPid).toBe("alice"));
    expect(bob.gmName()).toBe("alice");
    bob.close();
    newGm.close();
  });

  it("GM を渡した元の GM の参加証には、従う GM の pid を持つプレイヤー（後から入った人、再読み込みした人）は従わない", async () => {
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    // 元の GM（gm）は GM の参加証を持ったまま、gm/7 で偽のゲームを出す
    const oldId = await keys.mk("gm", "gm");
    const old = new GmEngine(meOf(oldId, "gm"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: oldId.kp.privateKey,
      now: () => Date.now(),
    });
    old.start(6);
    expect(old.epoch).toBe(7);
    // サーバーの記録では、いまの GM は carol（/join の gmPid か、交代を受けて保存した pid）
    const bobId = await keys.mk("bob", "player");
    const bob = new PlayerEngine(
      { ...meOf(bobId, "player"), gmPid: "carol" },
      {
        connector: relay.connector,
        verifier: keys.verifier(),
        privateKey: bobId.kp.privateKey,
        serverPub: keys.serverPub,
        now: () => Date.now(),
        saveSeq: () => {},
        saveGmPid: () => {},
        onTransferToMe: () => {},
      },
    );
    bob.start();
    expect(bob.gmPid).toBe("carol");
    relay.announce("gm/7", true); // 元の GM の epoch を announce でも見つける
    await new Promise((r) => setTimeout(r, 300));
    expect(bob.epoch).toBe(-1);
    expect(bob.view.phase).toBe("connecting");

    // 本当の GM（carol）が出てくれば従う
    const carolId = await keys.mk("carol", "gm");
    const carol = new GmEngine(meOf(carolId, "gm"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: carolId.kp.privateKey,
      now: () => Date.now(),
    });
    localStorage.clear(); // carol は別の端末
    carol.start(7);
    await vi.waitFor(() => expect(bob.epoch).toBe(8), { timeout: 4000 });
    expect(bob.view.gmPid).toBe("carol");
    bob.close();
    old.close();
    carol.close();
  });

  it("claim はやり直しても通らない失敗ならあきらめ、交代証の期限が過ぎてもあきらめる", async () => {
    const keys = await makeIdentities();
    const aliceId = await keys.mk("alice", "player");
    const transfer = await issueTransfer(keys.server.privateKey, {
      room: ROOM,
      from: "gm",
      to: "alice",
      iat: 0,
      exp: 100,
    });
    const step = { kind: "claim" as const, transfer, fromEpoch: 1 };
    const notFound = vi.fn().mockRejectedValue(Object.assign(new Error("gone"), { status: 404 }));
    const retry = { sleep: async () => {}, nowSec: () => 50 };
    expect(
      await claimUntilDone(meOf(aliceId, "player"), step, { claim: notFound, retry }),
    ).toBeNull();
    expect(notFound).toHaveBeenCalledTimes(1);

    let t = 50;
    const failing = vi.fn(async () => {
      t += 30;
      throw new Error("offline");
    });
    const sleeps: number[] = [];
    const r = await claimUntilDone(meOf(aliceId, "player"), step, {
      claim: failing,
      retry: { sleep: async (ms) => void sleeps.push(ms), nowSec: () => t },
    });
    expect(r).toBeNull();
    expect(failing).toHaveBeenCalledTimes(2); // 50 → 80 → 110（期限 100 を過ぎた）
    expect(sleeps).toEqual([1000, 2000]);
  });

  it("入り直しは通信の失敗をやり直す", async () => {
    const keys = await makeIdentities();
    const gmId = await keys.mk("gm", "gm");
    const playerCert = await issueCert(keys.server.privateKey, {
      ...gmId.cert.body,
      pid: "p2",
      role: "player",
    });
    const join = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      code: ROOM,
      pid: "p2",
      roomToken: "pt",
      cert: playerCert,
      moqUrl: "https://relay/x",
      locale: "ja",
      rounds: 3,
      limitSec: 60,
    });
    const next = await rejoinUntilDone(
      { ...meOf(gmId, "gm"), pending: { kind: "rejoin", gmPid: "alice" } },
      { join, retry: { sleep: async () => {}, nowSec: () => 0 } },
    );
    expect(join).toHaveBeenCalledTimes(2);
    expect(next).toMatchObject({ pid: "p2", role: "player", roomToken: "pt", seq: 0 });
    expect(next?.pending).toBeUndefined();
    expect(loadMe(ROOM)?.pid).toBe("p2");
  });
});

describe("一覧に載らないときの publish のやり直し", () => {
  it("8 秒から倍々に間隔を伸ばす", async () => {
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    const gmId = await keys.mk("gm", "gm");
    const aliceId = await keys.mk("alice", "player");
    const gm = new GmEngine(meOf(gmId, "gm"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: gmId.kp.privateKey,
      now: () => Date.now(),
    });
    gm.start();
    relay.dropAnnounce = true; // GM はプレイヤーの announce を受け取れず、一覧に載せられない
    let clock = 0;
    let checks = 0;
    const p = new PlayerEngine(meOf(aliceId, "player"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: aliceId.kp.privateKey,
      serverPub: keys.serverPub,
      now: () => (checks++, clock),
      saveSeq: () => {},
      saveGmPid: () => {},
      onTransferToMe: () => {},
    });
    p.start();
    const publishes = () =>
      relay.connections.flatMap((c) => c.publishes).filter((x) => x.path === "p/alice").length;
    /** 1 秒おきの確認が、あと n 回走るまで待つ。 */
    const ticks = async (n: number) => {
      const from = checks;
      await vi.waitFor(() => expect(checks).toBeGreaterThanOrEqual(from + n), {
        timeout: 1500 * n,
      });
    };
    await vi.waitFor(() => expect(p.view.phase).toBe("lobby"));
    expect(publishes()).toBe(1);
    await ticks(1); // 載っていないことに気付いた時刻 = 0
    clock = REJOIN_AFTER_MS;
    await vi.waitFor(() => expect(publishes()).toBe(2), { timeout: 3000 });
    clock = REJOIN_AFTER_MS * 2; // 次は 16 秒後なので、まだ
    await ticks(2);
    expect(publishes()).toBe(2);
    clock = REJOIN_AFTER_MS * 3;
    await vi.waitFor(() => expect(publishes()).toBe(3), { timeout: 3000 });
    p.close();
    gm.close();
  }, 20_000);
});

describe("GM の接続切れ（偽の Relay）", () => {
  it("GM の announce が消えたら接続切れ、新しい epoch に乗り換えたら戻る", async () => {
    const { relay, startGm, startPlayer } = await setup();
    const gm = startGm();
    const { p } = startPlayer();
    await vi.waitFor(() => expect(p.view.phase).toBe("lobby"));
    expect(p.gmDisconnectedSince).toBeNull();

    const changed = vi.fn();
    p.subscribe(changed);
    gm.close();
    relay.announce("gm/1", false);
    expect(p.gmDisconnectedSince).toBeGreaterThan(0);
    expect(changed).toHaveBeenCalled();
    expect(p.view.phase).toBe("lobby"); // 画面の段階は変えない

    const back = startGm(); // epoch 2 で戻る
    await vi.waitFor(() => expect(p.epoch).toBe(2));
    expect(p.gmDisconnectedSince).toBeNull();
    p.close();
    back.close();
  });

  it("同じ epoch の announce が戻っても接続切れを解く。古い epoch の announce が消えても気にしない", async () => {
    const { relay, startGm, startPlayer } = await setup();
    const gm = startGm();
    const { p } = startPlayer();
    await vi.waitFor(() => expect(p.epoch).toBe(1));
    relay.announce("gm/0", false);
    relay.announce("p/alice", false);
    expect(p.gmDisconnectedSince).toBeNull();
    relay.announce("gm/1", false);
    expect(p.gmDisconnectedSince).not.toBeNull();
    relay.announce("gm/1", true);
    expect(p.gmDisconnectedSince).toBeNull();
    p.close();
    gm.close();
  });

  it("GM を渡した後は、交代先が出てこないまま待ち時間が過ぎたときだけ接続切れにする", async () => {
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    const gmId = await keys.mk("gm", "gm");
    const bobId = await keys.mk("bob", "player");
    const gm = new GmEngine(meOf(gmId, "gm"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: gmId.kp.privateKey,
      now: () => Date.now(),
    });
    gm.start();
    const bob = new PlayerEngine(meOf(bobId, "player"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: bobId.kp.privateKey,
      serverPub: keys.serverPub,
      now: () => Date.now(),
      saveSeq: () => {},
      saveGmPid: () => {},
      onTransferToMe: () => {},
    });
    bob.start();
    await vi.waitFor(() => expect(bob.view.phase).toBe("lobby"));
    const nowSec = Math.floor(Date.now() / 1000);
    const transfer = await issueTransfer(keys.server.privateKey, {
      room: ROOM,
      from: "gm",
      to: "carol",
      iat: nowSec,
      exp: nowSec + 600,
    });
    gm.dispatch({ type: "transferred", transfer });
    await gm.flush();
    await vi.waitFor(() => expect(bob.gmPid).toBe("carol"));
    gm.close();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    relay.announce("gm/1", false);
    expect(bob.gmDisconnectedSince).toBeNull();
    vi.advanceTimersByTime(TRANSFER_GRACE_MS - 1);
    expect(bob.gmDisconnectedSince).toBeNull();
    vi.advanceTimersByTime(1);
    expect(bob.gmDisconnectedSince).not.toBeNull();
    bob.close();
  });
});

describe("自分の接続が切れたとき（偽の Relay）", () => {
  const bodyOf = (b: Uint8Array) =>
    (JSON.parse(new TextDecoder().decode(b)) as { body: { type: string; seq: number } }).body;
  const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => {});

  it("GM は epoch を 1 つ上げてつなぎ直し、状態とイベントの seq を続ける。プレイヤーは新しい epoch に乗り換える", async () => {
    const warn = quiet();
    try {
      const { relay, startGm, startPlayer } = await setup();
      const gm = startGm();
      const { p } = startPlayer();
      await vi.waitFor(() => expect(gm.state.players.alice).toBeDefined());
      await vi.waitFor(() => expect(p.epoch).toBe(1));
      const main = relay.connections.find((c) => c.publishes.some((x) => x.path === "gm/1"))!;
      main.drop();
      await vi.waitFor(() => expect(gm.epoch).toBe(2));
      expect(read(`sh:gmlink:${ROOM}`)).toMatchObject({ epoch: 2 });
      // つながるまで（1 秒待つ）のイベントは貯めておき、新しい epoch で届ける
      gm.dispatch({ type: "start", gameId: "g1" });
      await vi.waitFor(() => expect(p.epoch).toBe(2), { timeout: 4000 });
      await vi.waitFor(() => expect(p.view.phase).toBe("gmTurn"));
      expect(gm.state.players.alice).toBeDefined();
      expect(gm.reconnecting).toBe(false);
      p.close();
      gm.close();
    } finally {
      warn.mockRestore();
    }
  });

  it("プレイヤーの publish の接続が切れたら、同じ p/{pid} に join から始まる新しいグループで seq を続ける", async () => {
    const warn = quiet();
    try {
      const { relay, startGm, startPlayer } = await setup();
      const gm = startGm();
      const { p } = startPlayer();
      await vi.waitFor(() => expect(gm.state.players.alice).toBeDefined());
      const pub = relay.connections.find((c) => c.publishes.some((x) => x.path === "p/alice"))!;
      pub.drop();
      await vi.waitFor(() =>
        expect(
          relay.connections.filter((c) => c.publishes.some((x) => x.path === "p/alice")),
        ).toHaveLength(2),
      );
      p.send({ type: "away" });
      await p.flush();
      const groups = relay.tracks.get("p/alice#events")!.groups;
      const bodies = groups.at(-1)!.map(bodyOf);
      expect(bodies.map((b) => b.type)).toEqual(["join", "away"]);
      expect(bodies.map((b) => b.seq)).toEqual([1, 2]); // 最初の join が 0
      // GM は購読し直して、続きの seq のメッセージを受け付ける
      await vi.waitFor(() => expect(gm.state.players.alice?.away).toBe(true), { timeout: 3000 });
      p.close();
      gm.close();
    } finally {
      warn.mockRestore();
    }
  });

  it("プレイヤーの follow の接続が切れたら、購読し直して GM のイベントを受け続ける", async () => {
    const warn = quiet();
    try {
      const { relay, startGm, startPlayer } = await setup();
      const gm = startGm();
      const { p } = startPlayer();
      await vi.waitFor(() => expect(p.view.phase).toBe("lobby"));
      const follow = relay.connections.find(
        (c) => c.publishes.length === 0 && c.subscribes.some((x) => x.path === "gm/1"),
      )!;
      follow.drop();
      await vi.waitFor(() =>
        expect(
          relay.connections.filter((c) => !c.closed && c.subscribes.some((x) => x.path === "gm/1")),
        ).toHaveLength(1),
      );
      gm.dispatch({ type: "start", gameId: "g1" });
      await vi.waitFor(() => expect(p.view.phase).toBe("gmTurn"));
      p.close();
      gm.close();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("部屋を出る、通信が切れる（偽の Relay）", () => {
  it("leave を受けた GM は一覧から外し、プレイヤーの画面の一覧からも消える", async () => {
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    const gmId = await keys.mk("gm", "gm");
    const gm = new GmEngine(meOf(gmId, "gm"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: gmId.kp.privateKey,
      now: () => Date.now(),
    });
    gm.start();
    const mkPlayer = async (pid: string) => {
      const id = await keys.mk(pid, "player");
      const p = new PlayerEngine(meOf(id, "player"), {
        connector: relay.connector,
        verifier: keys.verifier(),
        privateKey: id.kp.privateKey,
        serverPub: keys.serverPub,
        now: () => Date.now(),
        saveSeq: () => {},
        saveGmPid: () => {},
        onTransferToMe: () => {},
      });
      p.start();
      return p;
    };
    const alice = await mkPlayer("alice");
    const bob = await mkPlayer("bob");
    await vi.waitFor(() => expect(alice.view.players).toHaveLength(2));
    bob.leave();
    bob.close(50);
    await vi.waitFor(() => expect(Object.keys(gm.state.players)).toEqual(["alice"]));
    await vi.waitFor(() => expect(alice.view.players.map((x) => x.pid)).toEqual(["alice"]));
    expect(gm.state.left).toEqual(["bob"]);
    alice.close();
    gm.close();
  });

  it("偽の leave（ほかの人の鍵、別のサーバーの参加証、ほかの人の Track）は無視し、本人の leave の後は join も受けない", async () => {
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    const gmId = await keys.mk("gm", "gm");
    const aliceId = await keys.mk("alice", "player");
    const malloryId = await keys.mk("mallory", "player");
    const forged = await (await makeIdentities()).mk("alice", "player"); // 別のサーバーが出した alice
    const gm = new GmEngine(meOf(gmId, "gm"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: gmId.kp.privateKey,
      now: () => Date.now(),
    });
    gm.start();
    // GM が announce を聞き始めてから publish する
    await vi.waitFor(() => expect(relay.connections.some((c) => c.listeners.size > 0)).toBe(true));
    const out = relay.connect();
    const aliceTrack = out.publish("p/alice", "events").appendGroup();
    const malloryTrack = out.publish("p/mallory", "events").appendGroup();
    const write = async (
      g: { writeFrame(b: Uint8Array): void },
      body: { pid: string; [k: string]: unknown },
      key: CryptoKey,
      cert: Cert,
    ) => g.writeFrame(encodeFrame(await seal(body, key, cert)));
    const alice = { key: aliceId.kp.privateKey, cert: aliceId.cert as Cert };
    await write(
      aliceTrack,
      { pid: "alice", seq: 0, type: "join", name: "x" },
      alice.key,
      alice.cert,
    );
    await write(
      malloryTrack,
      { pid: "mallory", seq: 0, type: "join", name: "x" },
      malloryId.kp.privateKey,
      malloryId.cert as Cert,
    );
    await vi.waitFor(() => expect(Object.keys(gm.state.players)).toEqual(["alice", "mallory"]));

    // alice の参加証に mallory の鍵で署名した leave
    await write(
      aliceTrack,
      { pid: "alice", seq: 1, type: "leave" },
      malloryId.kp.privateKey,
      alice.cert,
    );
    // 別のサーバーの参加証で alice を名乗る leave
    await write(
      aliceTrack,
      { pid: "alice", seq: 2, type: "leave" },
      forged.kp.privateKey,
      forged.cert as Cert,
    );
    // mallory の Track に載せた、alice を名乗る leave（mallory 本人の署名）
    await write(
      malloryTrack,
      { pid: "alice", seq: 1, type: "leave" },
      malloryId.kp.privateKey,
      malloryId.cert as Cert,
    );
    // 偽のフレームが処理し終わったことを、後に続く本物の away（届くと away になる）で確かめる
    await write(aliceTrack, { pid: "alice", seq: 3, type: "away" }, alice.key, alice.cert);
    await vi.waitFor(() => expect(gm.state.players.alice?.away).toBe(true));
    await new Promise((r) => setTimeout(r, 50)); // mallory の Track の分
    expect(Object.keys(gm.state.players)).toEqual(["alice", "mallory"]);
    expect(gm.state.left).toEqual([]);

    await write(aliceTrack, { pid: "alice", seq: 4, type: "leave" }, alice.key, alice.cert);
    await vi.waitFor(() => expect(Object.keys(gm.state.players)).toEqual(["mallory"]));
    // 出た人の後のメッセージ（join し直しも）は無視する
    await write(
      aliceTrack,
      { pid: "alice", seq: 5, type: "join", name: "x" },
      alice.key,
      alice.cert,
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(Object.keys(gm.state.players)).toEqual(["mallory"]);
    out.close();
    gm.close();
  });

  it("タブを閉じる（pagehide）とすぐ away になり、次のメッセージで戻る", async () => {
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    const gmId = await keys.mk("gm", "gm");
    const aliceId = await keys.mk("alice", "player");
    let clock = Date.now();
    const gm = new GmEngine(meOf(gmId, "gm"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: gmId.kp.privateKey,
      now: () => clock,
    });
    gm.start();
    const p = new PlayerEngine(meOf(aliceId, "player"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: aliceId.kp.privateKey,
      serverPub: keys.serverPub,
      now: () => Date.now(),
      saveSeq: () => {},
      saveGmPid: () => {},
      onTransferToMe: () => {},
    });
    p.start();
    await vi.waitFor(() => expect(p.view.players).toHaveLength(1));
    window.dispatchEvent(new Event("pagehide"));
    await vi.waitFor(() => expect(gm.state.players.alice.away).toBe(true));
    await vi.waitFor(() => expect(p.view.players[0].away).toBe(true));
    p.send({ type: "ping" });
    await vi.waitFor(() => expect(gm.state.players.alice.away).toBe(false));
    await vi.waitFor(() => expect(p.view.players[0].away).toBe(false));
    p.close();
    gm.close();
  });
});

describe("away の判定（偽の時計）", () => {
  /** GM と、手で書く alice の Track。setInterval と Date だけを偽にする（暗号と偽の Relay は本物の非同期で動く）。 */
  async function presenceSetup() {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    const gmId = await keys.mk("gm", "gm");
    const aliceId = await keys.mk("alice", "player");
    const gm = new GmEngine(meOf(gmId, "gm"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: gmId.kp.privateKey,
      now: () => Date.now(),
    });
    gm.start();
    await vi.waitFor(() => expect(relay.connections.some((c) => c.listeners.size > 0)).toBe(true));
    const out = relay.connect();
    const track = out.publish("p/alice", "events").appendGroup();
    let seq = 0;
    const send = async (type: string, extra: Record<string, unknown> = {}) =>
      track.writeFrame(
        encodeFrame(
          await seal(
            { pid: "alice", seq: seq++, type, ...extra },
            aliceId.kp.privateKey,
            aliceId.cert,
          ),
        ),
      );
    await send("join", { name: "alice" });
    await vi.waitFor(() => expect(gm.state.players.alice).toBeDefined());
    /** 1 秒ずつ n 回、時計とタイマーを進める。 */
    const step = async (n: number) => {
      for (let i = 0; i < n; i++) {
        vi.advanceTimersByTime(1000);
        await flush();
      }
    };
    const away = () => gm.state.players.alice?.away === true;
    const done = () => {
      out.close();
      gm.close();
    };
    return { gm, send, step, away, done };
  }

  it("20 秒メッセージが無い人は away、何か届けば戻る", async () => {
    const { send, step, away, done } = await presenceSetup();
    await step(20);
    expect(away()).toBe(false);
    await step(2);
    expect(away()).toBe(true);
    await send("ping");
    await vi.waitFor(() => expect(away()).toBe(false));
    // ping が続いていれば away にならない
    for (let i = 0; i < 6; i++) {
      await step(5);
      await send("ping");
    }
    await vi.waitFor(() => expect(away()).toBe(false));
    done();
  });

  it("本人が署名した本物のフレームでも、seq が増えていなければ（流し直し）捨てる", async () => {
    const { gm, send, step, away, done } = await presenceSetup();
    const seen: boolean[] = [];
    const off = gm.subscribe(() => seen.push(away()));
    await send("ping"); // seq 1
    await send("away", { seq: 1 }); // 同じ seq の流し直し
    await send("away", { seq: 0 }); // 古い seq
    await step(1);
    // 届いた順に処理するので、後に送った本物の leave が効いた時点で、流し直しは処理済み
    await send("leave");
    await vi.waitFor(() => expect(gm.state.left).toEqual(["alice"]));
    expect(seen).not.toContain(true);
    off();
    done();
  });

  it("GM のタブが止まっていた（判定の間隔が 5 秒より空いた）ときは、誰も away にせず数え直す", async () => {
    const { step, away, done } = await presenceSetup();
    await step(10);
    // 30 秒止まっていた（その間タイマーは動かない）
    vi.setSystemTime(Date.now() + 30_000);
    await step(1);
    expect(away()).toBe(false);
    // 数え直した時刻から 20 秒で away になる
    await step(19);
    expect(away()).toBe(false);
    await step(2);
    expect(away()).toBe(true);
    done();
  });

  it("タブが見えるようになったら数え直す", async () => {
    const { step, away, done } = await presenceSetup();
    await step(15);
    document.dispatchEvent(new Event("visibilitychange"));
    await step(15);
    expect(away()).toBe(false);
    await step(7);
    expect(away()).toBe(true);
    done();
  });

  it("away と ping を繰り返しても、切り替えは 1 人につき 2 秒に 1 往復まで", async () => {
    const { gm, send, step, away, done } = await presenceSetup();
    const flips: boolean[] = [];
    const off = gm.subscribe(() => flips.push(away()));
    await send("away");
    await send("ping"); // 戻すのはすぐ
    await send("away"); // 前の切り替えから 2 秒たっていないので受け付けない
    await send("ping");
    await send("away");
    await vi.waitFor(() => expect(flips).toEqual([true, false]));
    await new Promise((r) => setTimeout(r, 100)); // 残りの away と ping が処理されるのを待つ
    expect(flips).toEqual([true, false]);
    await step(PRESENCE_FLIP_MIN_MS / 1000);
    await send("away"); // 2 秒たったので受け付ける
    await vi.waitFor(() => expect(away()).toBe(true));
    await send("ping");
    await vi.waitFor(() => expect(away()).toBe(false));
    expect(flips).toEqual([true, false, true, false]);
    off();
    done();
  });
});

describe("プレイヤーの Track のグループと seq（偽の Relay）", () => {
  async function playerSetup(seq = 0) {
    const keys = await makeIdentities();
    const relay = new FakeRelay();
    const gmId = await keys.mk("gm", "gm");
    const aliceId = await keys.mk("alice", "player");
    const gm = new GmEngine(meOf(gmId, "gm"), {
      connector: relay.connector,
      verifier: keys.verifier(),
      privateKey: gmId.kp.privateKey,
      now: () => Date.now(),
    });
    gm.start();
    let clock = Date.now();
    const saved: number[] = [];
    const mk = (from: number) =>
      new PlayerEngine(meOf(aliceId, "player", from), {
        connector: relay.connector,
        verifier: keys.verifier(),
        privateKey: aliceId.kp.privateKey,
        serverPub: keys.serverPub,
        now: () => clock,
        saveSeq: (n) => saved.push(n),
        saveGmPid: () => {},
        onTransferToMe: () => {},
      });
    const p = mk(seq);
    p.start();
    await vi.waitFor(() => expect(gm.state.players.alice).toBeDefined());
    const groups = () => relay.tracks.get("p/alice#events")?.groups ?? [];
    const decode = (b: Uint8Array) =>
      JSON.parse(new TextDecoder().decode(b)).body as { type: string; seq: number };
    return {
      gm,
      p,
      mk,
      relay,
      saved,
      groups,
      decode,
      tick: (ms: number) => (clock += ms),
    };
  }

  it(`${GROUP_MAX_FRAMES} フレームごとに新しいグループを join から始め、GM は区切りをまたいでも受け続ける`, async () => {
    const { gm, p, relay, groups, decode } = await playerSetup();
    for (let i = 0; i < 30; i++) p.send({ type: "ping" });
    p.send({ type: "away" });
    await p.flush();
    const gs = groups();
    expect(gs.length).toBeGreaterThanOrEqual(3);
    for (const g of gs) expect(g.length).toBeLessThanOrEqual(GROUP_MAX_FRAMES);
    for (const g of gs.slice(1)) expect(decode(g[0]).type).toBe("join");
    // seq は区切りをまたいで 1 ずつ増え続ける
    const seqs = gs.flat().map((b) => decode(b).seq);
    expect(seqs).toEqual(seqs.map((_, i) => i));
    // 最後の away が届いた（区切りの後も、送り手ごとの seq で捨てられていない）
    await vi.waitFor(() => expect(gm.state.players.alice.away).toBe(true));

    // 後から購読した人には最新のグループだけが届き、それは join から始まる
    const late: string[] = [];
    const conn = relay.connect();
    conn.subscribe(
      "p/alice",
      "events",
      { announced: false },
      {
        frame: (b) => late.push(decode(b).type),
        end: () => {},
      },
    );
    await flush();
    expect(late[0]).toBe("join");
    expect(late.length).toBeLessThanOrEqual(GROUP_MAX_FRAMES);
    conn.close();
    p.close();
    gm.close();
  });

  it("区切るのは ping の直前だけ。区切りの直前の submit も GM に届いて扱われる", async () => {
    const { gm, p, relay, groups, decode } = await playerSetup();
    gm.dispatch({ type: "start", gameId: "g1" });
    gm.dispatch({ type: "gmPhotoUploaded", key: "k" });
    gm.dispatch({ type: "hintsReady", hints: ["a", "b", "c", "d", "e"], at: Date.now() });
    // join と ping 11 回でグループがいっぱいになる
    for (let i = 0; i < GROUP_MAX_FRAMES - 1; i++) p.send({ type: "ping" });
    // いっぱいでも、shutter と submit では区切らない
    p.send({ type: "shutter", round: 1, hash: "h" });
    p.send({ type: "submit", round: 1, key: `rooms/${ROOM}/g1/1/alice-0123abcd.jpg` });
    // 直後の ping の前で区切る
    p.send({ type: "ping" });
    await p.flush();
    const gs = groups();
    expect(gs).toHaveLength(2);
    expect(gs[0].map((b) => decode(b).type).slice(-2)).toEqual(["shutter", "submit"]);
    expect(gs[1].map((b) => decode(b).type)).toEqual(["join", "ping"]);
    await vi.waitFor(() => expect(gm.state.submissions.alice).toBeDefined());
    // GM はプレイヤーの Track を、古いグループも読み切るよう maxAge を付けて購読する
    const subs = relay.connections.flatMap((c) => c.subscribes).filter((x) => x.path === "p/alice");
    expect(subs.length).toBeGreaterThan(0);
    for (const x of subs) expect(x.maxAgeMs).toBe(PLAYER_TRACK_MAX_AGE_MS);
    p.close();
    gm.close();
  });

  it("60 秒たったら、フレームが少なくても新しいグループにする", async () => {
    const { gm, p, groups, decode, tick } = await playerSetup();
    p.send({ type: "ping" });
    tick(59_000);
    p.send({ type: "ping" });
    await p.flush();
    expect(groups()).toHaveLength(1);
    tick(1_000);
    p.send({ type: "ping" });
    await p.flush();
    expect(groups()).toHaveLength(2);
    expect(groups()[1].map((b) => decode(b).type)).toEqual(["join", "ping"]);
    p.close();
    gm.close();
  });

  it(`seq は ${SEQ_BLOCK} 個ずつ確保して保存し、再読み込みしても使った seq を使い直さない`, async () => {
    const { gm, p, mk, saved, groups, decode } = await playerSetup();
    for (let i = 0; i < 40; i++) p.send({ type: "ping" });
    await p.flush();
    // join（seq 0）と ping 40 回（ほかに区切りの join）。保存は確保のときだけ
    const used = Math.max(
      ...groups()
        .flat()
        .map((b) => decode(b).seq),
    );
    expect(saved).toEqual([SEQ_BLOCK, 2 * SEQ_BLOCK]);
    expect(used).toBeLessThan(saved.at(-1)!);
    p.close();

    // 再読み込み：保存した値から数える。GM は捨てずに受け取る
    const again = mk(saved.at(-1)!);
    again.start();
    again.send({ type: "away" });
    await vi.waitFor(() => expect(gm.state.players.alice.away).toBe(true));
    again.close();
    gm.close();
  });

  it("pagehide では使った分までを保存し直す", async () => {
    const { p, saved, gm } = await playerSetup();
    p.send({ type: "ping" });
    window.dispatchEvent(new Event("pagehide"));
    // join, ping, away で 3 つ使った
    expect(saved).toEqual([SEQ_BLOCK, 3]);
    // その後に送るときは確保し直す
    p.send({ type: "ping" });
    expect(saved).toEqual([SEQ_BLOCK, 3, 3 + SEQ_BLOCK]);
    p.close();
    gm.close();
  });
});

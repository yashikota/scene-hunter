import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { exportPrivateKey, generateKeyPair } from "../../src/shared/crypto";
import { MAX_PHOTO_BYTES } from "../../src/server/presign";
import {
  checkBlobPut,
  createE2ePresigner,
  createE2eRelay,
  createMemoryLimiter,
  E2E_HINTS,
  isE2e,
  verifyBlobUrl,
} from "../../src/server/e2e";

// e2e テストのモード（SH_E2E=1 かつ localhost）だけで差し替わる依存。SH_E2E が無いときは本番と同じ道を通ること。

// void/env は worker の外では読めないので、process.env（vi.stubEnv）を読む形に差し替える。
vi.mock("void/env", () => ({
  env: new Proxy({}, { get: (_, k) => (typeof k === "string" ? process.env[k] : undefined) }),
}));

// Workers AI の代わり。呼ばれた回数だけを数える。
const aiCalls = vi.hoisted(() => [] as string[]);
vi.mock("void/ai", () => ({
  ai: {
    run: async (model: string) => {
      aiCalls.push(model);
      return { response: { hints: ["a", "b", "c", "d", "e"] } };
    },
    provider: () => ({ fetch: async () => new Response("{}", { status: 500 }) }),
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isE2e", () => {
  it("SH_E2E が '1' で、宛先が localhost のときだけ true", () => {
    expect(isE2e("1", "http://localhost:5199/api/rooms")).toBe(true);
    expect(isE2e("1", "http://127.0.0.1:5199/api/rooms")).toBe(true);
    expect(isE2e("1", "http://[::1]:5199/api/rooms")).toBe(true);
  });

  it("SH_E2E が無い、または 1 以外なら localhost でも false", () => {
    for (const flag of [undefined, "", "0", "true", "yes"]) {
      expect(isE2e(flag, "http://localhost:5199/api/rooms")).toBe(false);
    }
  });

  it("localhost 以外の宛先なら SH_E2E があっても false", () => {
    for (const url of [
      "https://game.scene-hunter.workers.dev/api/rooms",
      "http://localhost.example.com/api/rooms",
      "http://10.0.0.1/api/rooms",
      "not a url",
    ]) {
      expect(isE2e("1", url)).toBe(false);
    }
  });
});

describe("createE2eRelay", () => {
  it("部屋ごとに別のパスを配り、moqUrl は手元の Relay を指す", async () => {
    const { relay, moqUrl } = createE2eRelay("http://localhost:4443");
    const a = await relay.create("sh-111111");
    const b = await relay.create("sh-222222");
    expect(a.token).not.toBe(b.token);
    expect(moqUrl(a.token)).toBe(`http://localhost:4443/${a.token}`);
    await expect(relay.delete(a.uid)).resolves.toBeUndefined();
    expect(await relay.list()).toEqual([]);
  });

  it("ヒントは 5 つ", () => {
    expect(E2E_HINTS).toHaveLength(5);
  });
});

describe("createE2ePresigner / verifyBlobUrl", () => {
  const NOW = 1_800_000_000_000;
  const p = createE2ePresigner({ origin: "http://localhost:5199", secret: "s", now: () => NOW });
  const key = "rooms/123456/g/1/p-0123456789abcdef.jpg";

  it("PUT の URL は同じオリジンの /api/e2e/blob で、署名した大きさを返す", async () => {
    const u = new URL(await p.put(key, 1000));
    expect(u.origin).toBe("http://localhost:5199");
    expect(u.pathname).toBe("/api/e2e/blob");
    expect(await verifyBlobUrl("s", u, "PUT", NOW / 1000)).toMatchObject({ key, size: 1000 });
  });

  it("改ざん、別のメソッド、別の秘密、期限切れは通さない", async () => {
    const put = new URL(await p.put(key, 1000));
    const get = new URL(await p.get(key));
    expect(await verifyBlobUrl("s", get, "GET", NOW / 1000)).toMatchObject({ key });
    expect(await verifyBlobUrl("s", put, "GET", NOW / 1000)).toBeNull();
    expect(await verifyBlobUrl("other", put, "PUT", NOW / 1000)).toBeNull();
    expect(await verifyBlobUrl("s", put, "PUT", NOW / 1000 + 300)).toBeNull();
    for (const [k, v] of [
      ["key", "rooms/999999/g/1/p-0123456789abcdef.jpg"],
      ["size", "1001"],
      ["exp", String(NOW / 1000 + 9999)],
      ["sig", "0".repeat(64)],
    ]) {
      const t = new URL(put);
      t.searchParams.set(k, v);
      expect(await verifyBlobUrl("s", t, "PUT", NOW / 1000)).toBeNull();
    }
  });

  it("PUT の中身は image/jpeg で、署名した大きさちょうど（上限以内）", () => {
    const claim = { method: "PUT" as const, key, size: 3, exp: 0 };
    expect(checkBlobPut(claim, "image/jpeg", new Uint8Array(3))).toBe(true);
    expect(checkBlobPut(claim, "image/png", new Uint8Array(3))).toBe(false);
    expect(checkBlobPut(claim, undefined, new Uint8Array(3))).toBe(false);
    expect(checkBlobPut(claim, "image/jpeg", new Uint8Array(4))).toBe(false);
    const big = { ...claim, size: MAX_PHOTO_BYTES + 1 };
    expect(checkBlobPut(big, "image/jpeg", new Uint8Array(MAX_PHOTO_BYTES + 1))).toBe(false);
  });
});

describe("createMemoryLimiter", () => {
  it("キーごとに 60 秒あたり上限まで通し、窓が変われば数え直す", async () => {
    let t = 0;
    const l = createMemoryLimiter(2, () => t);
    expect((await l.limit({ key: "a" })).success).toBe(true);
    expect((await l.limit({ key: "a" })).success).toBe(true);
    expect((await l.limit({ key: "a" })).success).toBe(false);
    expect((await l.limit({ key: "b" })).success).toBe(true);
    t = 60_000;
    expect((await l.limit({ key: "a" })).success).toBe(true);
  });
});

// ---- 本番の道が変わらないこと（SH_E2E が無いとき） ----

type Ctx = Parameters<typeof import("../../src/server/deps").limiter>[0];

function ctx(url: string, env: Record<string, unknown> = {}): Ctx & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    req: {
      url,
      header: () => undefined,
      arrayBuffer: async () => new ArrayBuffer(3),
    },
    env,
    json: (body: unknown, status: number) => (sent.push(body), { body, status }),
    body: (_: unknown, status: number) => ({ status }),
  } as never;
}

async function stubProductionSecrets(): Promise<void> {
  const pair = await generateKeyPair();
  vi.stubEnv("HMAC_SECRET", "h");
  vi.stubEnv("SERVER_SIGNING_KEY", await exportPrivateKey(pair.privateKey));
  vi.stubEnv("CF_ACCOUNT_ID", "acc");
  vi.stubEnv("CF_API_TOKEN", "tok");
  vi.stubEnv("R2_BUCKET", "bkt");
  vi.stubEnv("R2_ACCESS_KEY_ID", "AK");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "SK");
}

describe("deps（SH_E2E が無いとき）", () => {
  it("localhost でも e2e のモードにならず、Rate Limiting の binding をそのまま使う", async () => {
    const { e2eMode, limiter } = await import("../../src/server/deps");
    vi.stubEnv("SH_E2E", "");
    const binding = { limit: async () => ({ success: false }) };
    const c = ctx("http://localhost:5199/api/rooms", { RL_CREATE: binding });
    expect(e2eMode(c)).toBe(false);
    expect(limiter(c, "RL_CREATE")).toBe(binding);
  });

  it("Relay は Cloudflare、写真の URL は R2 を指す", async () => {
    const { photoDeps, roomDeps } = await import("../../src/server/deps");
    await stubProductionSecrets();
    const c = ctx("http://localhost:5199/api/rooms", { KV: {}, STORAGE: {} });
    const r = await roomDeps(c);
    expect(r.moqUrl).toBeUndefined();
    const url = new URL(await photoDeps(c).presigner.put("rooms/1/g/1/p-x.jpg", 10));
    expect(url.host).toBe("acc.r2.cloudflarestorage.com");
  });

  it("SH_E2E=1 でも localhost 以外からのリクエストなら本番と同じ", async () => {
    const { e2eMode, limiter, photoDeps, roomDeps } = await import("../../src/server/deps");
    await stubProductionSecrets();
    vi.stubEnv("SH_E2E", "1");
    const binding = { limit: async () => ({ success: true }) };
    const c = ctx("https://game.scene-hunter.workers.dev/api/rooms", {
      KV: {},
      STORAGE: {},
      RL_JOIN: binding,
    });
    expect(e2eMode(c)).toBe(false);
    expect(limiter(c, "RL_JOIN")).toBe(binding);
    expect((await roomDeps(c)).moqUrl).toBeUndefined();
    const url = new URL(await photoDeps(c).presigner.get("rooms/1/g/1/p-x.jpg"));
    expect(url.host).toBe("acc.r2.cloudflarestorage.com");
  });

  it("SH_E2E=1 かつ localhost なら手元の Relay と /api/e2e/blob を使い、上限を上げた数え方にする", async () => {
    const { limiter, photoDeps, roomDeps } = await import("../../src/server/deps");
    await stubProductionSecrets();
    vi.stubEnv("SH_E2E", "1");
    const binding = { limit: async () => ({ success: false }) };
    const c = ctx("http://localhost:5199/api/rooms", { KV: {}, STORAGE: {}, RL_CREATE: binding });
    expect(limiter(c, "RL_CREATE")).not.toBe(binding);
    expect((await limiter(c, "RL_CREATE").limit({ key: "k" })).success).toBe(true);
    expect((await roomDeps(c)).moqUrl?.("tok")).toBe("http://localhost:4443/tok");
    const url = new URL(await photoDeps(c).presigner.put("rooms/1/g/1/p-x.jpg", 10));
    expect(url.origin + url.pathname).toBe("http://localhost:5199/api/e2e/blob");
  });
});

describe("/api/e2e/blob", () => {
  it("SH_E2E が無ければ、localhost からでも PUT も GET も 404（何も読み書きしない）", async () => {
    const { GET, PUT } = await import("../../routes/api/e2e/blob.dev");
    await stubProductionSecrets();
    vi.stubEnv("SH_E2E", "");
    const touched: string[] = [];
    const STORAGE = {
      put: async (k: string) => void touched.push(k),
      get: async (k: string) => (touched.push(k), null),
    };
    const presigned = await createE2ePresigner({
      origin: "http://localhost:5199",
      secret: "h",
      now: () => Date.now(),
    }).put("rooms/123456/g/1/p-0123456789abcdef.jpg", 3);
    for (const handler of [PUT, GET]) {
      const res = await handler(ctx(presigned, { STORAGE }));
      expect(res).toMatchObject({ status: 404 });
    }
    expect(touched).toEqual([]);
  });

  it("SH_E2E=1 でも localhost 以外からなら 404", async () => {
    const { GET, PUT } = await import("../../routes/api/e2e/blob.dev");
    await stubProductionSecrets();
    vi.stubEnv("SH_E2E", "1");
    const url = "https://game.scene-hunter.workers.dev/api/e2e/blob?m=GET&key=k";
    for (const handler of [PUT, GET]) {
      expect(await handler(ctx(url, { STORAGE: {} }))).toMatchObject({ status: 404 });
    }
  });
});

describe("POST /api/rooms/:code/hints", () => {
  async function call(url: string): Promise<unknown> {
    const { POST } = await import("../../routes/api/rooms/[code]/hints");
    const { issueRoomToken } = await import("../../src/server/hmac");
    await stubProductionSecrets();
    const token = await issueRoomToken("h", {
      room: "123456",
      role: "gm",
      pid: "gm1",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const key = "rooms/123456/g/1/gm1-0123456789abcdef.jpg";
    const c = {
      req: {
        url,
        param: () => "123456",
        header: (h: string) => (h === "authorization" ? `Bearer ${token}` : undefined),
        json: async () => ({ key }),
      },
      env: {
        KV: { get: async () => ({ code: "123456", gmPid: "gm1", gmSince: 0, locale: "ja" }) },
        STORAGE: { get: async () => ({ size: 3, arrayBuffer: async () => new ArrayBuffer(3) }) },
        RL_HINTS: { limit: async () => ({ success: true }) },
      },
      json: (body: unknown, status: number) => Response.json(body, { status }),
    };
    const res = (await POST(c as never)) as Response;
    return res.json();
  }

  it("SH_E2E が無ければ localhost でも AI を呼ぶ", async () => {
    vi.stubEnv("SH_E2E", "");
    aiCalls.length = 0;
    expect(await call("http://localhost:5199/api/rooms/123456/hints")).toEqual({
      hints: ["a", "b", "c", "d", "e"],
    });
    expect(aiCalls).toHaveLength(1);
  });

  it("SH_E2E=1 かつ localhost なら AI を呼ばず、決まったヒントを返す", async () => {
    vi.stubEnv("SH_E2E", "1");
    aiCalls.length = 0;
    expect(await call("http://localhost:5199/api/rooms/123456/hints")).toEqual({
      hints: [...E2E_HINTS],
    });
    expect(aiCalls).toHaveLength(0);
  });
});

import { describe, expect, it } from "vite-plus/test";
import { issueRoomToken } from "../../src/server/hmac";
import { createPresigner, MAX_PHOTO_BYTES } from "../../src/server/presign";
import { createRoomStore } from "../../src/server/roomStore";
import { listRoundPhotos, requestUpload } from "../../src/server/services/photos";
import type { PhotoDeps } from "../../src/server/services/photos";
import { AuthError, NotFoundError } from "../../src/server/services/rooms";

const SECRET = "test-secret";
const NOW_MS = 1_800_000_000_000;
const CODE = "123456";
const GM = "11111111-1111-4111-8111-111111111111";
const PL = "22222222-2222-4222-8222-222222222222";

function setup() {
  const kvMap = new Map<string, string>();
  const kv = {
    get: async (k: string) => (kvMap.has(k) ? JSON.parse(kvMap.get(k)!) : null),
    put: async (k: string, v: string) => void kvMap.set(k, v),
    delete: async (k: string) => void kvMap.delete(k),
  } as never;
  const store = createRoomStore(kv);
  const listed: string[] = [];
  const d: PhotoDeps = {
    presigner: createPresigner({
      accountId: "a",
      bucket: "b",
      accessKeyId: "k",
      secretAccessKey: "s",
    }),
    storage: {
      list: async (o: { prefix?: string }) => {
        listed.push(o.prefix ?? "");
        return {
          objects: [
            { key: `${o.prefix}${PL}-abcdef0123456789.jpg` },
            { key: `${o.prefix}${GM}-fedcba9876543210.jpg` },
          ],
          truncated: false,
        };
      },
      get: async () => null,
    } as never,
    store,
    hmacSecret: SECRET,
    now: () => NOW_MS,
    rand: () => "0123456789abcdef",
  };
  const tok = (role: "gm" | "player", pid: string, room = CODE) =>
    issueRoomToken(SECRET, { room, role, pid, exp: NOW_MS / 1000 + 1000 });
  const seed = () =>
    store.put({
      code: CODE,
      relayUid: "u",
      moqToken: "t",
      locale: "ja",
      rounds: 3,
      limitSec: 60,
      createdAt: NOW_MS,
      gmPid: GM,
      gmSince: 0,
    });
  return { d, tok, seed, listed };
}

describe("requestUpload", () => {
  it("プレイヤーに自分の pid のキーと URL を返す", async () => {
    const { d, tok, seed } = setup();
    await seed();
    const r = await requestUpload(d, await tok("player", PL), CODE, {
      gameId: "g1",
      round: 2,
      size: 1000,
    });
    expect(r.key).toBe(`rooms/${CODE}/g1/2/${PL}-0123456789abcdef.jpg`);
    expect(new URL(r.url).pathname).toBe(`/b/${r.key}`);
  });
  it("size の範囲外は RangeError", async () => {
    const { d, tok, seed } = setup();
    await seed();
    const t = await tok("player", PL);
    for (const size of [0, -1, 1.5, MAX_PHOTO_BYTES + 1]) {
      await expect(
        requestUpload(d, t, CODE, { gameId: "g", round: 1, size }),
      ).rejects.toBeInstanceOf(RangeError);
    }
    await expect(
      requestUpload(d, t, CODE, { gameId: "g", round: 1, size: MAX_PHOTO_BYTES }),
    ).resolves.toBeTruthy();
  });
  it("gameId と round の不正は RangeError", async () => {
    const { d, tok, seed } = setup();
    await seed();
    const t = await tok("player", PL);
    for (const gameId of ["", "a/b", "../x", "a".repeat(33)]) {
      await expect(requestUpload(d, t, CODE, { gameId, round: 1, size: 1 })).rejects.toBeInstanceOf(
        RangeError,
      );
    }
    for (const round of [0, 11, 1.5, NaN]) {
      await expect(
        requestUpload(d, t, CODE, { gameId: "g", round, size: 1 }),
      ).rejects.toBeInstanceOf(RangeError);
    }
  });
  it("他の部屋のトークン、不正なトークン、存在しない部屋は拒否", async () => {
    const { d, tok, seed } = setup();
    await seed();
    const i = { gameId: "g", round: 1, size: 1 };
    await expect(
      requestUpload(d, await tok("player", PL, "999999"), CODE, i),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(requestUpload(d, "bad", CODE, i)).rejects.toBeInstanceOf(AuthError);
    await expect(
      requestUpload(d, await tok("player", PL, "999999"), "999999", i),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it("古い GM のトークンは拒否", async () => {
    const { d, tok, seed } = setup();
    await seed();
    await expect(
      requestUpload(d, await tok("gm", PL), CODE, { gameId: "g", round: 1, size: 1 }),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

describe("listRoundPhotos", () => {
  it("GM には pid 付きの GET URL を返す", async () => {
    const { d, tok, seed, listed } = setup();
    await seed();
    const r = await listRoundPhotos(d, await tok("gm", GM), CODE, { gameId: "g1", round: 2 });
    expect(listed).toEqual([`rooms/${CODE}/g1/2/`]);
    expect(r.map((x) => x.pid)).toEqual([PL, GM]);
    expect(new URL(r[0].url).searchParams.get("X-Amz-Expires")).toBe("3600");
  });
  it("プレイヤーと古い GM は拒否", async () => {
    const { d, tok, seed } = setup();
    await seed();
    const i = { gameId: "g1", round: 1 };
    await expect(listRoundPhotos(d, await tok("player", PL), CODE, i)).rejects.toBeInstanceOf(
      AuthError,
    );
    await expect(listRoundPhotos(d, await tok("gm", PL), CODE, i)).rejects.toBeInstanceOf(
      AuthError,
    );
  });
});

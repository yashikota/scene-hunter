import { describe, expect, it } from "vite-plus/test";
import {
  MAX_PHOTO_BYTES,
  createPresigner,
  parsePhotoKey,
  photoKey,
} from "../../src/server/presign";

const p = createPresigner({
  accountId: "acc",
  bucket: "bkt",
  accessKeyId: "AK",
  secretAccessKey: "SK",
});

describe("presigner", () => {
  it("PUT は content-length と content-type を署名し、300 秒で切れる", async () => {
    const u = new URL(await p.put("rooms/123456/g/1/x-y.jpg", 1000));
    expect(u.host).toBe("acc.r2.cloudflarestorage.com");
    expect(u.pathname).toBe("/bkt/rooms/123456/g/1/x-y.jpg");
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("300");
  });
  it("GET は 3600 秒で切れる", async () => {
    const u = new URL(await p.get("rooms/123456/g/1/x-y.jpg"));
    expect(u.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(u.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
  it("photoKey と上限", () => {
    expect(photoKey({ code: "123456", gameId: "g1", round: 2, pid: "p", rand: "r" })).toBe(
      "rooms/123456/g1/2/p-r.jpg",
    );
    expect(MAX_PHOTO_BYTES).toBe(1_048_576);
  });
  it("photoKey → parsePhotoKey が往復する（pid に - や _、UUID、gameId に - や _）", () => {
    for (const pid of ["11111111-1111-4111-8111-111111111111", "a-b_c-", "-x"]) {
      const p = { code: "123456", gameId: "g-1_x", round: 10, pid, rand: "0f1e2d3c4b5a6978" };
      expect(parsePhotoKey(photoKey(p))).toEqual(p);
    }
  });
  it("形式に合わないキーは null", () => {
    for (const k of [
      "rooms/123456/g/1/p-ABCDEF0123456789.jpg",
      "rooms/123456/g/1/p-0123456789abcdef.png",
      "rooms/123456/g/1/a/b-0123456789abcdef.jpg",
      "rooms/12345/g/1/p-0123456789abcdef.jpg",
      "rooms/123456/g/1/-0123456789abcdef.jpg",
    ]) {
      expect(parsePhotoKey(k)).toBeNull();
    }
  });
});

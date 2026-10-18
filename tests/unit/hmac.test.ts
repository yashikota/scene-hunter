import { describe, expect, it } from "vite-plus/test";
import { issueRoomToken, verifyRoomToken, type RoomTokenPayload } from "../../src/server/hmac";

const SECRET = "test-secret";
const NOW = 1_800_000_000;
const payload: RoomTokenPayload = { room: "r1", role: "gm", pid: "p1", exp: NOW + 3600 };

function base64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

describe("room token (HMAC)", () => {
  it("verifies a freshly issued token and returns its payload", async () => {
    const token = await issueRoomToken(SECRET, payload);
    expect(await verifyRoomToken(SECRET, token, NOW)).toEqual(payload);
  });

  it("issues the documented base64url(payload).base64url(sig) format", async () => {
    const token = await issueRoomToken(SECRET, payload);
    const [body, sig, ...rest] = token.split(".");
    expect(rest).toEqual([]);
    expect(JSON.parse(base64urlDecode(body))).toEqual(payload);
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns null when one character of the payload is tampered with", async () => {
    const token = await issueRoomToken(SECRET, payload);
    const [body, sig] = token.split(".");
    const tampered = body.startsWith("A") ? "B" + body.slice(1) : "A" + body.slice(1);
    expect(await verifyRoomToken(SECRET, `${tampered}.${sig}`, NOW)).toBeNull();
  });

  it("returns null when the secret differs", async () => {
    const token = await issueRoomToken(SECRET, payload);
    expect(await verifyRoomToken("other-secret", token, NOW)).toBeNull();
  });

  it("returns null at and after exp", async () => {
    const token = await issueRoomToken(SECRET, payload);
    expect(await verifyRoomToken(SECRET, token, payload.exp - 1)).toEqual(payload);
    expect(await verifyRoomToken(SECRET, token, payload.exp)).toBeNull();
    expect(await verifyRoomToken(SECRET, token, payload.exp + 1)).toBeNull();
  });

  it("returns null for a string without a dot", async () => {
    expect(await verifyRoomToken(SECRET, "nodotatall", NOW)).toBeNull();
  });

  it("returns null without throwing for malformed input", async () => {
    expect(await verifyRoomToken(SECRET, "", NOW)).toBeNull();
    expect(await verifyRoomToken(SECRET, "a.b.c", NOW)).toBeNull();
    expect(await verifyRoomToken(SECRET, "!!!.???", NOW)).toBeNull();
  });

  it("returns null when a validly signed payload has a non-JSON body", async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const body = base64urlEncode("not json");
    const sigBytes = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
    );
    const sig = base64urlEncode(String.fromCharCode(...sigBytes));
    expect(await verifyRoomToken(SECRET, `${body}.${sig}`, NOW)).toBeNull();
  });

  it("returns null when a validly signed payload has an invalid role", async () => {
    const token = await issueRoomToken(SECRET, { ...payload, role: "spectator" as never });
    expect(await verifyRoomToken(SECRET, token, NOW)).toBeNull();
  });
});

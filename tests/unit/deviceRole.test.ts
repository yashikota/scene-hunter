import { describe, expect, it } from "vite-plus/test";
import { defaultHostRole } from "../../src/client/game/deviceRole";

describe("端末ごとの初期役割", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "admin"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", "admin"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "admin"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile", "gm"],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile", "gm"],
    ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", "gm"],
  ] as const)("%s → %s", (ua, role) => expect(defaultHostRole(ua)).toBe(role));
});

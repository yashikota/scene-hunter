import { defineHandler } from "void";
import { allow } from "../../../../src/server/limits";
import { clientIp, limiter, tooMany } from "../../../../src/server/deps";
import { createRoomStore } from "../../../../src/server/roomStore";
import { roomExists } from "../../../../src/server/services/rooms";

/**
 * 部屋があるかだけを返す（{ exists: true } か { exists: false }。どちらも 200）。
 * 404 にしないのは、本番（Void / Cloudflare）が GET の 404 を SPA の index.html（200）に差し替えるため。名前を入れてもらう前に、番号の打ち間違いを知らせるために使う。
 * 入るとき（join）と同じ RL_JOIN で IP ごとに数えるが、入る回数を食わないよう別のキーにする。
 * そのため IP ごとに 1 分あたり join 10 回と確かめ 10 回まで通る。1 つの Wi-Fi（同じ IP）から
 * 1 分のうちに 10 人を超えて入ると 429 になる（join と同じ上限）。番号は 10^6 通りあり、存在は join でも
 * 分かるので、確かめを分けても総当たりのしやすさはほとんど変わらない。
 */
export const GET = defineHandler(async (c) => {
  if (!(await allow(limiter(c, "RL_JOIN"), `exists:${clientIp(c)}`))) return tooMany(c);
  const store = createRoomStore((c.env as { KV: KVNamespace }).KV);
  return { exists: await roomExists(store, c.req.param("code") ?? "") };
});

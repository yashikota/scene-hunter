import { defineHandler } from 'void';
import { allow } from '../../../../src/server/limits';
import { clientIp, limiter, tooMany } from '../../../../src/server/deps';
import { createRoomStore } from '../../../../src/server/roomStore';
import { roomExists } from '../../../../src/server/services/rooms';

/**
 * 部屋があるかだけを返す（200 か 404）。名前を入れてもらう前に、番号の打ち間違いを知らせるために使う。
 * 入るとき（join）と同じ RL_JOIN で IP ごとに数えるが、入る回数を食わないよう別のキーにする。
 */
export const GET = defineHandler(async (c) => {
  if (!(await allow(limiter(c, 'RL_JOIN'), `exists:${clientIp(c)}`))) return tooMany(c);
  const store = createRoomStore((c.env as { KV: KVNamespace }).KV);
  if (!(await roomExists(store, c.req.param('code') ?? ''))) return c.json({ error: 'not_found' }, 404);
  return { exists: true };
});

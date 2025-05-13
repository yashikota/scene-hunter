// server/game/index.ts

import { Hono } from 'hono';
import createRoom from '../routes/createRoom';
import getRoom from '../handlers/getRoom';
import joinRoom from '../routes/joinRoom';
import { RoomObject } from '../roomObject';

const app = new Hono();

// ルーティング登録
app.route('/', createRoom);
app.route('/', getRoom);
app.route('/', joinRoom);

export { RoomObject };

export default {
  fetch: app.fetch,
  // 正しい Durable Object のマッピング
  bindings: {
    RoomObject,
  },
};

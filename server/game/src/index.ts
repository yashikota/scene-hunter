// server/game/index.ts

import { Hono } from 'hono';
import rooms from '../routes/createRoom';
import { RoomObject } from '../roomObject';

const app = new Hono();

// ルーティング登録
app.route('/', rooms);

export { RoomObject } from '../roomObject';

export default {
  fetch: app.fetch,
  // Durable Object のマッピング
  async DurableObject() {
    return {
      RoomObject,
    };
  },
};
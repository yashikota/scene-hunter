import { Hono } from 'hono';
import createRoom from '../routes/createRoom';
import getRoom from '../handlers/getRoom';
import joinRoom from '../routes/joinRoom';
import setGamemaster from '../routes/setGamemaster';
import leaveRoom from '../routes/leaveRoom';
import updateRoomSettings from '../routes/updateRoomSettings';
import getLeaderBoard from '../handlers/getLeaderBoard';
import testRank from '../routes/testRank';
import getRound from '../handlers/getRound';
import startRound from '../routes/startRound';
import endRound from '../routes/endRound';
import testGetRounds from '../handlers/testGetRounds';
import generateHintsFromPhoto from '../routes/generateHintsFromPhoto';
import { RoomObject } from '../roomObject';

const app = new Hono();

// ルーティング登録
app.route('/', createRoom);
app.route('/', getRoom);
app.route('/', joinRoom);
app.route('/', setGamemaster);
app.route('/', leaveRoom);
app.route('/', updateRoomSettings);
app.route('/', getLeaderBoard);
app.route('/', testRank);
app.route('/', getRound);
app.route('/', startRound);
app.route('/', endRound);
app.route('/', testGetRounds);
app.route('/', generateHintsFromPhoto);

export { RoomObject };

export default {
  fetch: app.fetch,
  // 正しい Durable Object のマッピング
  bindings: {
    RoomObject,
  },
};

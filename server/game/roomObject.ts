// room-object.ts
import type { RoomState } from './types';
import type { DurableObjectState, DurableObjectStorage } from '@cloudflare/workers-types';

// Import handlers
import { handleInit } from './handlers/initHandler';
import { handleRoomStart } from './handlers/roomStartHandler';
import { handleRoomInfo } from './handlers/roomInfoHandler';
import { handleJoin } from './handlers/joinHandler';
import { handleGamemaster } from './handlers/gamemasterHandler';
import { handleLeave } from './handlers/leaveHandler';
import { handleSettings } from './handlers/settingsHandler';
import { handleLeaderboard } from './handlers/leaderboardHandler';
import { handleTestRank } from './handlers/testRankHandler';
import { handleRoundPhoto } from './handlers/roundPhotoHandler';
import { handleRoundEnd } from './handlers/roundEndHandler';
import { handleRoundInfo } from './handlers/roundInfoHandler';
import { handleRoundsList } from './handlers/roundsListHandler';
import { handleUpdatePlayerName } from './handlers/updatePlayerNameHandler';

// 通知APIにイベントを送信するユーティリティ関数を追加
async function notifyRoomEvent(roomId: string, eventType: string, content: string) {
  const url = `https://scene-hunter-notify.yashikota.workers.dev/api/rooms/${roomId}/events`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType, content })
  });
}

export class RoomObject {
  state: DurableObjectState;
  storage: DurableObjectStorage;
  room: RoomState | null = null; // Memory cache, primarily set by /init

  constructor(state: DurableObjectState) {
    this.state = state;
    this.storage = state.storage;
    // オプション: コンストラクタで 'room' をストレージから読み込む
    // this.state.blockConcurrencyWhile(async () => {
    //   this.room = await this.storage.get<RoomState>('room') || null;
    // });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // curl -X PUT http://localhost:4282/players/<player_id>
    const playerMatch = pathname.match(/^\/players\/([^\/]+)$/);
    if (playerMatch && request.method === 'PUT') {
      const playerId = playerMatch[1];
      return handleUpdatePlayerName(this.storage, request, playerId);
    }
    // curl -X PUT http://localhost:4282/rooms/:room_id/players/:player_id
    const playerMatchWithRoom = pathname.match(/^\/rooms\/([^\/]+)\/players\/([^\/]+)$/);
    if (playerMatchWithRoom && request.method === 'PUT') {
      const playerId = playerMatchWithRoom[2];
      return handleUpdatePlayerName(this.storage, request, playerId);
    }

    // より具体的なパスを先に評価する
    // curl.exe -X POST http://localhost:4282/rooms -H "Authorization: Bearer dummy-token" -H "Content-Type: application/json" --data-raw "{\"creator_id\": \"host_name\", \"rounds\": 3}"
    if (pathname === '/init') {
      const { response, roomState } = await handleInit(this.storage, request);
      if (roomState) {
        this.room = roomState; // インスタンスのキャッシュを更新
      }
      return response;
    }

    // /rooms/:roomId/start
    //curl -X POST http://localhost:4282/rooms/<room_id>/start -H "Authorization: Bearer test" -H "Content-Type: application/json" -d "{\"gamemaster_id\": \"host_name\"}"
    const roomStartMatch = pathname.match(/^\/rooms\/([^/]+)\/start$/);
    if (roomStartMatch && request.method === 'POST') {
      const roomId = roomStartMatch[1];
      const response = await handleRoomStart(this.storage, request, roomId);
      await notifyRoomEvent(roomId, 'game.round_started', 'ラウンドが開始されました');
      return response;
    }

    // /rounds/:roundId/photo
    //curl -X POST http://localhost:4282/rooms/<room_id>/rounds/<round_id>/photo -H "Authorization: Bearer testtoken" -F "player_id=tom" -F "photo=@path/to/photo.jpg"
    const roundPhotoMatch = pathname.match(/^\/rounds\/([^/]+)\/photo$/);
    if (roundPhotoMatch && request.method === 'POST') {
      const roundId = roundPhotoMatch[1];
      const response = await handleRoundPhoto(this.storage, request, roundId);
      const roomId = this.room?.id || '';
      const reqForm = await request.clone().formData().catch(() => null);
      const playerId = reqForm?.get('player_id') || '';
      if (roomId && playerId) {
        await notifyRoomEvent(roomId, 'game.photo_submitted', '写真が提出されました');
      }
      return response;
    }

    // /rounds/:roundId/end
    //curl -X POST http://localhost:4282/rooms/<room_id>/rounds/<round_id>/end -H "Authorization: Bearer test"
    const roundEndMatch = pathname.match(/^\/rounds\/([^/]+)\/end$/);
    if (roundEndMatch && request.method === 'POST') {
      const roundId = roundEndMatch[1];
      const response = await handleRoundEnd(this.storage, request, roundId);
      const roomId = this.room?.id || '';
      if (roomId) {
        await notifyRoomEvent(roomId, 'game.round_ended', 'ラウンドが終了しました');
      }
      return response;
    }

    // /rounds/:roundId (GET)
    //curl -X GET http://localhost:4282/rooms/<room_id>/rounds/<round_id> -H "Authorization: Bearer test"
    const roundInfoMatch = pathname.match(/^\/rounds\/([^/]+)$/);
    if (roundInfoMatch && request.method === 'GET') {
      const roundId = roundInfoMatch[1];
      return handleRoundInfo(this.storage, request, roundId);
    }
    
    // /info (GET)
    //curl http://localhost:4282/rooms/<room_id> -H "Authorization: Bearer testtoken"
    if (pathname === '/info' && request.method === 'GET') {
      return handleRoomInfo(this.storage, request);
    }
    
    // /join (POST)
    //curl -X POST http://localhost:4282/rooms/<room_id>/join -H "Content-Type: application/json" -H "Authorization: Bearer testtoken" -d "{\"player_id\": \"tom\", \"room_code\": \"594623\"}"
    if (pathname === '/join' && request.method === 'POST') {
      const response = await handleJoin(this.storage, request);
      // ルームIDとプレイヤー情報を取得して通知
      const roomId = this.room?.id || '';
      let playerId = '';
      try {
        const body: any = await request.clone().json();
        playerId = body.player_id;
      } catch {}
      if (roomId && playerId) {
        await notifyRoomEvent(roomId, 'room.player_joined', 'プレイヤーが参加しました');
      }
      return response;
    }

    // /gamemaster (PUT)
    //curl -X PUT http://localhost:4282/rooms/<room_id>/gamemaster -H "Authorization: Bearer testtoken" -H "Content-Type: application/json" -d "{\"player_id\": \"tom\"}"
    if (pathname === '/gamemaster' && request.method === 'PUT') {
      const response = await handleGamemaster(this.storage, request);
      const roomId = this.room?.id || '';
      let playerId = '';
      try {
        const body: any = await request.clone().json();
        playerId = body.player_id;
      } catch {}
      if (roomId && playerId) {
        await notifyRoomEvent(roomId, 'room.gamemaster_changed', 'ゲームマスターが変更されました');
      }
      return response;
    }

    // /leave (POST)
    //curl -X POST http://localhost:4282/rooms/<room_id>/leave -H "Authorization: Bearer testtoken" -H "Content-Type: application/json" -d "{\"player_id\": \"tom\"}"
    if (pathname === '/leave' && request.method === 'POST') {
      const response = await handleLeave(this.storage, request);
      const roomId = this.room?.id || '';
      let playerId = '';
      try {
        const body: any = await request.clone().json();
        playerId = body.player_id;
      } catch {}
      if (roomId && playerId) {
        await notifyRoomEvent(roomId, 'room.player_left', 'プレイヤーが退出しました');
      }
      return response;
    }

    // /settings (PUT)
    //curl -X PUT http://localhost:4282/rooms/<room_id>/settings -H "Authorization: Bearer testtoken" -H "Content-Type: application/json" -d "{\"rounds\": 2}"
    if (pathname === '/settings' && request.method === 'PUT') {
      return handleSettings(this.storage, request);
    }

    // /leaderboard (GET)
    //curl -X GET http://localhost:4282/rooms/<room_id>/leaderboard -H "Authorization: Bearer testtoken"
    if (pathname === '/leaderboard' && request.method === 'GET') {
      return handleLeaderboard(this.storage, request);
    }
    
    // /test-rank (POST)
    //curl -X POST http://localhost:4282/rooms/<room_id>/test-rank -H "Authorization: Bearer testtoken"
    if (pathname === '/test-rank' && request.method === 'POST') {
      return handleTestRank(this.storage, request);
    }

    // /rounds (GET)
    //curl -X GET http://localhost:4282/rooms/<room_id>/rounds -H "Authorization: Bearer test"
    if (pathname === '/rounds' && request.method === 'GET') {
        return handleRoundsList(this.storage, request);
    }

    return new Response('Not found', { status: 404 });
  }
}
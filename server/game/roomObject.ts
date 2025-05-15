import type { RoomState } from './types';
import type { DurableObjectState, DurableObjectStorage } from '@cloudflare/workers-types';

export class RoomObject {
  state: DurableObjectState;
  storage: DurableObjectStorage;
  room: RoomState | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/init' && request.method === 'POST') {
        const data = await request.json();
        this.room = data as RoomState;
        await this.storage.put('room', this.room);
        // roundStatesの生成・保存処理
        this.room.roundStates = {};
        for (let i = 0; i < this.room.rounds; i++) {
            const roundId = crypto.randomUUID();
            this.room.roundStates[roundId] = {
                round_id: roundId,
                room_id: this.room.id,
                round_number: i + 1,
                start_time: '',
                end_time: '',
                state: 'waiting',
                master_photo_id: '',
                hints: [],
                revealed_hints: 0,
                submissions: [],
            };
        }
        await this.storage.put('room', this.room);

        return new Response('Room initialized');
    }
    // curl.exe -X POST http://localhost:4282/rooms -H "Authorization: Bearer dummy-token" -H "Content-Type: application/json" --data-raw "{\"creator_id\": \"host_name\", \"rounds\": 3}" 

    if (url.pathname === '/info') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
      }

      const stored = await this.storage.get<RoomState>('room');
      if (!stored) {
        return new Response('Room not found', { status: 404 });
      }

      // OpenAPI仕様に変換
      const result = {
        room_id: stored.id,
        room_code: stored.code,
        created_at: stored.createdAt,
        creator_id: stored.host,
        gamemaster_id: stored.host, // 仮にhost = gamemaster
        state: stored.status,
        players: stored.players.map((player) => ({
          player_id: player.player_id,
          name: player.name,
          role: player.role,
          score: player.score,
        })),
        current_round: 0, // 仮置き
        total_rounds: stored.rounds,
      };

      return Response.json(result);
    }
    //curl http://localhost:4282/rooms/<room_id> -H "Authorization: Bearer testtoken"

    if (url.pathname === '/join' && request.method === 'POST') {
        const { player_id, room_code } = await request.json() as { player_id: string; room_code: string };
        const stored = await this.storage.get<RoomState>('room');
        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        if (stored.code !== room_code) {
            return new Response('Room code mismatch', { status: 400 });
        }

        if (stored.status !== 'waiting') {
            return new Response('Room is not open for joining', { status: 409 });
        }

        if (stored.players.some(player => player.player_id === player_id)) {
            return new Response('Player already joined', { status: 409 });
        }

        if (stored.players.length >= stored.maxPlayers) {
            return new Response('Room is full', { status: 409 });
        }

        stored.players.push({ player_id, name: '', role: player_id === stored.host ? 'gamemaster' : 'player', score: 0 });

        // ここでストレージに保存
        await this.storage.put('room', stored);

        return Response.json({ success: true });
    }
    //curl -X POST http://localhost:4282/rooms/<room_id>/join -H "Content-Type: application/json" -H "Authorization: Bearer testtoken" -d "{\"player_id\": \"tom\", \"room_code\": \"594623\"}"

    if (url.pathname === '/gamemaster' && request.method === 'PUT') {
        const { player_id } = await request.json() as { player_id: string };
        const stored = await this.storage.get<RoomState>('room');

        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        const player = stored.players.find(p => p.player_id === player_id);
        if (!player) {
            return new Response('Player not in room', { status: 403 });
        }

        // host と role を更新
        stored.host = player_id;
        stored.players = stored.players.map(p => ({
            ...p,
            role: p.player_id === player_id ? 'gamemaster' : 'player',
        }));

        await this.storage.put('room', stored);

        return Response.json({ success: true });
    }
    //curl -X PUT http://localhost:4282/rooms/<room_id>/gamemaster -H "Authorization: Bearer testtoken" -H "Content-Type: application/json" -d "{\"player_id\": \"tom\"}"

    if (url.pathname === '/leave' && request.method === 'POST') {
        const { player_id } = await request.json() as { player_id: string };
        const stored = await this.storage.get<RoomState>('room');

        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        const playerExists = stored.players.some(p => p.player_id === player_id);
        if (!playerExists) {
            return new Response('Player not in room', { status: 404 });
        }

        // プレイヤーを削除
        stored.players = stored.players.filter(p => p.player_id !== player_id);

        // ゲームマスターだった場合、host を空に
        if (stored.host === player_id) {
            stored.host = '';

            // 他のプレイヤーがいれば最初のプレイヤーを新たな gamemaster に昇格
            if (stored.players.length > 0) {
            const newHost = stored.players[0].player_id;
            stored.host = newHost;
            stored.players = stored.players.map(p => ({
                ...p,
                role: p.player_id === newHost ? 'gamemaster' : 'player',
            }));
            }
        }

        await this.storage.put('room', stored);

        return Response.json({ success: true });
    }
    //curl -X POST http://localhost:4282/rooms/<room_id>/leave -H "Authorization: Bearer testtoken" -H "Content-Type: application/json" -d "{\"player_id\": \"tom\"}"

    if (url.pathname === '/settings' && request.method === 'PUT') {
        const { rounds } = await request.json() as { rounds: number };
        const stored = await this.storage.get<RoomState>('room');

        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        // 状態チェック（例: 進行中のゲームは設定変更禁止など）
        if (stored.status !== 'waiting') {
            return new Response('Room settings cannot be changed after game start', { status: 403 });
        }

        stored.rounds = rounds;
        await this.storage.put('room', stored);

        return Response.json({ success: true });
    }
    //curl -X PUT http://localhost:4282/rooms/<room_id>/settings -H "Authorization: Bearer testtoken" -H "Content-Type: application/json" -d "{\"rounds\": 2}"
    
    if (url.pathname === '/leaderboard') {
        if (request.method !== 'GET') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        const stored = await this.storage.get<RoomState>('room');
        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        // スコア降順でソートし、順位付け
        const sorted = [...stored.players]
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .map((p, index) => ({
            player_id: p.player_id,
            name: p.name ?? '',
            total_score: p.score ?? 0,
            rank: index + 1,
            }));

        return Response.json({ players: sorted });
    }
    //curl -X GET http://localhost:4282/rooms/<room_id>/leaderboard -H "Authorization

    //テスト用：全員にランダムなスコア付与
    if (url.pathname === '/test-rank' && request.method === 'POST') {
        const stored = await this.storage.get<RoomState>('room');
        if (!stored) {
            return new Response('Room not found', { status: 404 });
        }

        // 各プレイヤーにランダムスコア（例: 0〜100）を付与
        const updatedPlayers = stored.players.map((p) => ({
            ...p,
            score: Math.floor(Math.random() * 101), // 0〜100の整数
        }));

        stored.players = updatedPlayers;
        await this.storage.put('room', stored);

        return Response.json({ success: true, players: updatedPlayers });
    }
    //curl -X POST http://localhost:4282/rooms/<room_id>/test-rank -H "Authorization: Bearer testtoken"

    if (url.pathname.startsWith('/rounds/') && url.pathname.endsWith('/start') && request.method === 'POST') {
        const match = url.pathname.match(/^\/rounds\/([^/]+)\/start$/);
        if (!match) {
            return new Response('Bad Request', { status: 400 });
        }

        const roundId = match[1];
        const body = await request.json() as { gamemaster_id?: string };
        const gamemaster_id = body.gamemaster_id;
        if (!gamemaster_id) {
            return new Response('Missing gamemaster_id', { status: 400 });
        }

        const room = await this.storage.get<RoomState>('room');
        if (!room || !room.roundStates || !room.roundStates[roundId]) {
            return new Response('Round not found', { status: 404 });
        }

        const round = room.roundStates[roundId];

        // ゲームマスター検証（room.host を使用）
        if (gamemaster_id !== room.host) {
            return new Response('Forbidden', { status: 403 });
        }

        // ラウンド状態チェック
        if (round.state !== 'waiting') {
            return new Response('Round already started or ended', { status: 400 });
        }

        // ラウンド開始処理
        const start_time = new Date().toISOString();
        round.state = 'in_progress';
        round.start_time = start_time;

        room.roundStates[roundId] = round;
        await this.storage.put('room', room);

        return Response.json({
            round_id: roundId,
            start_time,
        });
    }
    //curl -X POST http://localhost:4282/rooms/<room_id>/rounds/<round_id>/start -H "Authorization: Bearer test" -H "Content-Type: application/json" -d "{\"gamemaster_id\": \"host_name\"}"

    if (url.pathname.startsWith('/rounds/') && url.pathname.endsWith('/end') && request.method === 'POST') {
        const match = url.pathname.match(/^\/rounds\/([^/]+)\/end$/);
        if (!match) {
            return new Response('Bad Request', { status: 400 });
        }

        const roundId = match[1];

        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) {
            return new Response('Unauthorized', { status: 401 });
        }

        const room = await this.storage.get<RoomState>('room');
        if (!room || !room.roundStates || !room.roundStates[roundId]) {
            return new Response('Round not found', { status: 404 });
        }

        const round = room.roundStates[roundId];

        if (round.state !== 'in_progress') {
            return new Response('Cannot end round not in progress', { status: 400 });
        }

        //ラウンド終了処理
        const now = new Date().toISOString();
        round.state = 'ended';
        round.end_time = now;

        room.roundStates[roundId] = round;
        await this.storage.put('room', room);

        return Response.json({
            round_id: roundId,
            end_time: now,
            success: true,
        });
    }
    //curl -X POST http://localhost:4282/rooms/<room_id>/rounds/<round_id>/end -H "Authorization: Bearer test"

    if (url.pathname.startsWith('/rounds/')) {
        if (request.method !== 'GET') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        const match = url.pathname.match(/^\/rounds\/([^/]+)$/);
        if (!match) {
            return new Response('Bad Request', { status: 400 });
        }

        const roundId = match[1];
        const stored = await this.storage.get<RoomState>('room');
        if (!stored || !stored.roundStates || !stored.roundStates[roundId]) {
            return new Response('Round not found', { status: 404 });
        }

        const round = stored.roundStates[roundId];

        const response = {
            round_id: round.round_id,
            room_id: round.room_id,
            round_number: round.round_number,
            start_time: round.start_time,
            end_time: round.end_time,
            state: round.state,
            master_photo_id: round.master_photo_id,
            hints: round.hints,
            revealed_hints: round.revealed_hints,
            submissions: round.submissions,
        };

        return Response.json(response);
    }
    //curl -X GET http://localhost:4282/rooms/<room_id>/rounds/<round_id> -H "Authorization: Bearer test"

    if (url.pathname === '/rounds' && request.method === 'GET') {
        const room = await this.storage.get<RoomState>('room');
        if (!room || !room.roundStates) {
            return new Response('Room not found', { status: 404 });
        }

        const rounds = Object.values(room.roundStates).map((round) => ({
            round_id: round.round_id,
            round_number: round.round_number,
            state: round.state,
            start_time: round.start_time,
            end_time: round.end_time,
        }));

        return Response.json({ rounds });
    }
    //curl -X GET http://localhost:4282/rooms/<room_id>/rounds -H "Authorization: Bearer test"

    return new Response('Not found', { status: 404 });
  }
}

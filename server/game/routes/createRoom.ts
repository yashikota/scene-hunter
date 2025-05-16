// createRoom.ts
import { Hono } from 'hono';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { validator } from 'hono/validator';
// import type { RoomState } from '../types'; // RoomState全体の構築はDO側で行うため、ここでは不要になる可能性

const app = new Hono<{ Bindings: { ROOM_OBJECT: DurableObjectNamespace } }>();

const CreateRoomSchema = z.object({
  creator_id: z.string(),
  creator_name: z.string().optional().default('Admin'), // 管理者の名前を追加 (オプション)
  rounds: z.number().int().min(1),
});

// Durable Objectの/initに渡すペイロードの型定義
interface InitPayload {
  code: string;
  total_rounds: number;
  admin_player_details: {
    player_id: string;
    name: string;
  };
  host_internal_id: string; // createRoom.tsで生成した管理者の内部ID
}

app.post(
  '/rooms',
  validator('json', (value, c) => {
    const result = CreateRoomSchema.safeParse(value);
    if (!result.success) {
      return c.text('Invalid request', 400);
    }
    return result.data;
  }),
  async (c) => {
    const body = c.req.valid('json'); // validatorミドルウェアがパースと検証を行う
    console.log("ROOM CREATE BODY", body);
    const { creator_id, creator_name, rounds } = body;

    // 認証（仮実装: 本来はJWTなどから取得すべき）
    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return c.text('Unauthorized', 401);
    }

    const room_id = randomUUID(); // Durable Object の ID (idFromName用)
    const room_code = generateRoomCode(); // ユーザー向けの短いルームコード
    const host_internal_id = randomUUID(); // 管理者プレイヤーの内部IDをここで生成

    const payloadForInit: InitPayload = {
      code: room_code,
      total_rounds: rounds,
      admin_player_details: {
        player_id: creator_id, // 外部のユーザーIDをplayer_idとして使用
        name: creator_name,    // リクエストから取得した名前を使用
      },
      host_internal_id: host_internal_id, // 生成した内部ID
    };

    const durableObjectId = c.env.ROOM_OBJECT.idFromName(room_id);
    const stub = c.env.ROOM_OBJECT.get(durableObjectId);

    // Durable Objectの/initを呼び出し、初期化情報を渡す
    const initResponse = await stub.fetch('http://internal/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadForInit),
    });

    if (!initResponse.ok) {
        const errorText = await initResponse.text();
        console.error("Failed to initialize room object:", errorText);
        return c.text(`Failed to initialize room: ${errorText}`, initResponse.status as any);
    }

    const initResult = await initResponse.json() as { success: boolean, code?: string, admin_player_id?: string, message?: string };

    if (!initResult.success) {
        console.error("Initialization reported failure:", initResult.message);
        return c.text(`Room initialization failed: ${initResult.message || 'Unknown error'}`, 500);
    }

    return c.json({
      room_id: room_id, // DOの特定に使ったID (必要に応じてinternal_room_idを返すように変更も検討)
      room_code: initResult.code, // DOから返されたルームコード
      // host_internal_id: host_internal_id, // クライアントに返す必要があれば
      // admin_player_id: initResult.admin_player_id // DOから返された管理者のplayer_id
    });
  }
);

// 6桁のルームコード生成（例：312456）
function generateRoomCode(): string {
  const chars = '0123456789';
  return Array.from({ length: 6 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
}

export default app;
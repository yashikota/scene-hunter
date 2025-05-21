import { Hono, Context, Next } from "hono";
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { authMiddleware } from '../../middlewares/auth'; // Adjust path as necessary
import { ChatRoom } from "./room";
import type { Env as OriginalEnv } from "./types";

// Augment the Env type to include Supabase variables
interface Env extends OriginalEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

// Define a type for the context variables
interface AppVariables {
  supabase?: SupabaseClient;
  user?: any; // From authMiddleware
}

// Honoアプリケーションの作成
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Middleware to initialize Supabase client
// This should run for paths that require Supabase, before authMiddleware.
// Specifically, /api/rooms/:roomId/events will need this.
// /ws, /health, /test might not, but it's safe to run for them too if Supabase vars are present.
app.use('/api/rooms/:roomId/events', async (c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) => {
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_ANON_KEY) {
    console.error('Supabase URL or Anon Key not set in environment for /api route.');
    // For this specific API route, Supabase is critical, so we might return an error.
    return c.json({ error: 'Configuration error: Supabase environment variables not set.' }, 500);
  }
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  c.set('supabase', supabase);
  await next();
});

// Apply JWT authentication middleware ONLY to the event submission route
app.post('/api/rooms/:roomId/events', authMiddleware);

// WebSocket接続のハンドリング
// @ts-ignore - Honoの型定義の問題を回避
app.get("/ws/:roomId", async (c) => {
  const roomId = c.req.param("roomId");

  // リクエストがWebSocketアップグレードリクエストかどうかを確認
  if (c.req.header("Upgrade") !== "websocket") {
    return c.text("Expected Upgrade: websocket", 426);
  }

  // Durable Objectのインスタンスを取得
  const id = c.env.CHATROOM.idFromName(roomId);
  const roomObject = c.env.CHATROOM.get(id);

  // リクエストをDurable Objectに転送
  // @ts-ignore - Cloudflare WorkersとHonoの型定義の互換性の問題を回避
  return roomObject.fetch(c.req.raw);
});

// イベント送信API
// The authMiddleware is already applied to the POST route.
// The Supabase client init middleware is also applied.
app.post("/api/rooms/:roomId/events", async (c) => {
  // Supabase client and user should be available in context here if auth succeeded
  // const supabase = c.get('supabase');
  // const user = c.get('user');
  // console.log('Authenticated user for event submission:', user?.id);

  const roomId = c.req.param("roomId");
  const event = await c.req.json();

  // イベントの検証
  if (!event || !event.event_type) {
    return c.json({ error: "Invalid event format" }, 400);
  }

  // Durable Objectのインスタンスを取得
  const id = c.env.CHATROOM.idFromName(roomId);
  const roomObject = c.env.CHATROOM.get(id);

  // イベントを送信
  const response = await roomObject.fetch("https://internal/send-event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    return c.json({ error: "Failed to send event" }, 500);
  }

  return c.json({ success: true });
});

// ヘルスチェックエンドポイント
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// テスト用エンドポイント - 指定されたルームに「hello, world!」をブロードキャスト
app.get("/test", async (c) => {
  // roomIdとroomIDの両方をサポート（大文字小文字の違い）
  const roomId = c.req.query("roomId") || c.req.query("roomID");

  if (!roomId) {
    return c.json({ error: "roomId or roomID is required" }, 400);
  }

  console.log(`テストエンドポイント呼び出し: roomId=${roomId}`);

  // Durable Objectのインスタンスを取得
  const id = c.env.CHATROOM.idFromName(roomId);
  const roomObject = c.env.CHATROOM.get(id);

  // イベントを作成
  const event = {
    event_type: "chat.message",
    timestamp: new Date().toISOString(),
    sender: "system",
    content: "hello, world!",
  };

  // イベントを送信
  const response = await roomObject.fetch("https://internal/send-event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    return c.json({ error: "Failed to send event" }, 500);
  }

  return c.json({
    success: true,
    message: `Sent "hello, world!" to room ${roomId}`,
  });
});

// Durable Objectのエクスポート
export { ChatRoom };

// Workerのエクスポート
export default app;

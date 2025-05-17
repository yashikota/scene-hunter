import { Hono } from "hono";
import { ChatRoom } from "./room";
import type { Env } from "./types";

// Honoアプリケーションの作成
const app = new Hono<{ Bindings: Env }>();

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
app.post("/api/rooms/:roomId/events", async (c) => {
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

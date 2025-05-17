import type {
  Request as CFRequest,
  DurableObjectState,
  WebSocket,
} from "@cloudflare/workers-types";
import type {
  ClientMessage,
  EventType,
  Message,
  SystemMessage,
  User,
} from "./types";

// WebSocketPairの定義
interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
  [key: number]: WebSocket;
}

declare global {
  var WebSocketPair: {
    prototype: WebSocketPair;
    new (): WebSocketPair;
    (): WebSocketPair;
  };
}

// TypeScriptの型エラーを回避するための型定義
declare global {
  interface ResponseInit {
    webSocket?: WebSocket;
  }
}

/**
 * ChatRoomクラス - チャットルームのDurable Object実装
 *
 * 各ルームはDurable Objectとして実装され、WebSocket接続とメッセージングを管理します。
 */
// Cloudflare Workersの型定義に合わせてDurableObjectを実装
export class ChatRoom {
  private state: DurableObjectState;
  private users: Map<string, User> = new Map();
  private roomId: string | null = null;
  private latestEvent: EventType | null = null;
  private eventHistory: EventType[] = [];

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  /**
   * リクエストハンドラ
   */
  // DurableObjectインターフェースに合わせたfetchメソッド
  async fetch(request: CFRequest): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // WebSocket接続のハンドリング
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.handleWebSocket(request);
    }

    // イベント送信のハンドリング
    if (path === "/send-event" && request.method === "POST") {
      const event = (await request.json()) as EventType;
      this.broadcastEvent(event);
      this.latestEvent = event;
      this.eventHistory.push(event);

      // 履歴が長すぎる場合は古いものを削除
      if (this.eventHistory.length > 100) {
        this.eventHistory.shift();
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 最新のイベントを取得
    if (path === "/latest-event" && request.method === "GET") {
      return new Response(JSON.stringify(this.latestEvent || {}), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // その他のリクエストは404を返す
    return new Response("Not found", { status: 404 });
  }

  /**
   * WebSocket接続のハンドリング
   */
  private async handleWebSocket(request: CFRequest): Promise<Response> {
    // WebSocketペアの作成
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // URLからルームIDとユーザーIDを取得
    const url = new URL(request.url);
    this.roomId = url.pathname.split("/").pop() || null;
    const userId = url.searchParams.get("userId");

    if (!userId) {
      server.accept();
      server.send(
        JSON.stringify({
          type: "system",
          systemType: "error",
          content: "ユーザーIDが指定されていません",
          timestamp: Date.now(),
        } as SystemMessage),
      );
      server.close(1000, "ユーザーIDが指定されていません");
      return new Response(null, { status: 400 });
    }

    // 既に同じユーザーIDが存在する場合はエラー
    if (this.users.has(userId)) {
      server.accept();
      server.send(
        JSON.stringify({
          type: "system",
          systemType: "error",
          content: "このユーザーIDは既に使用されています",
          timestamp: Date.now(),
        } as SystemMessage),
      );
      server.close(1000, "このユーザーIDは既に使用されています");
      return new Response(null, { status: 400 });
    }

    // WebSocketの接続を受け入れる
    server.accept();

    // ユーザーをルームに追加
    this.users.set(userId, { id: userId, webSocket: server });

    // 接続イベントのハンドラを設定
    server.addEventListener("message", async (event: any) => {
      try {
        await this.handleMessage(userId, event);
      } catch (error) {
        console.error("メッセージ処理エラー:", error);
      }
    });

    // 切断イベントのハンドラを設定
    server.addEventListener("close", () => {
      this.handleDisconnect(userId);
    });

    server.addEventListener("error", () => {
      this.handleDisconnect(userId);
    });

    // 他のユーザーに新しいユーザーが参加したことを通知
    const joinEvent: EventType = {
      event_type: "room.player_joined",
      timestamp: new Date().toISOString(),
      player_id: userId,
      name: userId,
    };
    this.broadcastEvent(joinEvent);

    // 接続したユーザーに現在のユーザーリストを送信
    const welcomeEvent: EventType = {
      event_type: "room.connected",
      timestamp: new Date().toISOString(),
      player_id: userId,
      content: `ルーム ${this.roomId} に接続しました。現在のユーザー: ${Array.from(this.users.keys()).join(", ")}`,
    };
    server.send(JSON.stringify(welcomeEvent));

    // 過去のイベント履歴を送信
    if (this.eventHistory.length > 0) {
      for (const event of this.eventHistory) {
        server.send(JSON.stringify(event));
      }
    }

    return new Response(null, {
      status: 101,
      headers: {
        Upgrade: "websocket",
      },
      // @ts-ignore - Cloudflare Workersの型定義では、ResponseInitにwebSocketプロパティが存在しないが、
      // 実際のCloudflare Workersの実装では、このプロパティを使用してWebSocketを返す
      webSocket: client,
    });
  }

  /**
   * メッセージ処理
   */
  private async handleMessage(userId: string, wsEvent: any): Promise<void> {
    let data: ClientMessage | any;

    try {
      // 受信したデータをトリミングして整形
      const rawData = (wsEvent.data as string).trim();
      console.log(`受信データ: ${rawData}`);

      // JSONパースを試みる
      data = JSON.parse(rawData);
    } catch (error) {
      console.error("JSONパースエラー:", error);

      // エラーメッセージをユーザーに送信
      const sender = this.users.get(userId);
      if (sender) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorEvent: EventType = {
          event_type: "system.error",
          timestamp: new Date().toISOString(),
          content: `JSONパースエラー: ${errorMessage}。正しいJSON形式で送信してください。例: {"event_type":"chat.message","content":"こんにちは"}`,
        };
        sender.webSocket.send(JSON.stringify(errorEvent));
      }
      return;
    }

    // データの検証
    if (!data.type || !data.content) {
      console.error("無効なメッセージ形式:", data);
      const sender = this.users.get(userId);
      if (sender) {
        const errorEvent: EventType = {
          event_type: "system.error",
          timestamp: new Date().toISOString(),
          content: "無効なメッセージ形式です。contentフィールドが必要です。",
        };
        sender.webSocket.send(JSON.stringify(errorEvent));
      }
      return;
    }

    // 古いメッセージ形式を新しいイベント形式に変換
    const event: EventType = {
      event_type: "chat.message",
      timestamp: new Date().toISOString(),
      sender: userId,
      content: data.content,
      ...(data.recipient && { recipient: data.recipient }),
    };

    console.log(`メッセージ処理: ${JSON.stringify(event)}`);

    // イベントをブロードキャスト
    this.broadcastEvent(event);

    // イベント履歴に追加
    this.latestEvent = event;
    this.eventHistory.push(event);

    // 履歴が長すぎる場合は古いものを削除
    if (this.eventHistory.length > 100) {
      this.eventHistory.shift();
    }

    // イベント履歴をストレージに保存
    try {
      this.state.storage.put("latestEvent", this.latestEvent);
      this.state.storage.put("eventHistory", this.eventHistory);
    } catch (error) {
      console.error(`イベント保存エラー: ${error}`);
    }
  }

  /**
   * 切断処理
   */
  private handleDisconnect(userId: string): void {
    // ユーザーをルームから削除
    this.users.delete(userId);

    // 他のユーザーに切断を通知
    const leaveEvent: EventType = {
      event_type: "room.player_left",
      timestamp: new Date().toISOString(),
      player_id: userId,
    };
    this.broadcastEvent(leaveEvent);

    // ルームが空になった場合の処理
    if (this.users.size === 0) {
      console.log(`ルーム ${this.roomId} は空になりました`);
      // 必要に応じてクリーンアップ処理を追加
    }
  }

  /**
   * ブロードキャストメッセージの送信
   */
  private broadcast(
    message: Message | SystemMessage,
    excludeUserId?: string,
  ): void {
    const messageStr = JSON.stringify(message);

    for (const [userId, user] of this.users.entries()) {
      // 除外するユーザーIDが指定されている場合はスキップ
      if (excludeUserId && userId === excludeUserId) continue;

      try {
        user.webSocket.send(messageStr);
      } catch (error) {
        console.error(`メッセージ送信エラー (${userId}):`, error);
      }
    }
  }

  /**
   * 個別メッセージの送信
   */
  private sendPrivateMessage(message: Message, recipientId: string): void {
    const recipient = this.users.get(recipientId);
    if (!recipient) {
      // 受信者が見つからない場合は送信者にエラーを返す
      const sender = this.users.get(message.sender);
      if (sender) {
        const errorEvent: EventType = {
          event_type: "system.error",
          timestamp: new Date().toISOString(),
          content: `ユーザー ${recipientId} は見つかりません`,
        };
        sender.webSocket.send(JSON.stringify(errorEvent));
      }
      return;
    }

    // 受信者にメッセージを送信
    try {
      recipient.webSocket.send(JSON.stringify(message));
    } catch (error) {
      console.error("個別メッセージ送信エラー:", error);
    }

    // 送信者にも同じメッセージを送信（自分のメッセージを表示するため）
    const sender = this.users.get(message.sender);
    if (sender) {
      try {
        sender.webSocket.send(JSON.stringify(message));
      } catch (error) {
        console.error("個別メッセージ送信エラー (送信者):", error);
      }
    }
  }

  /**
   * イベントのブロードキャスト
   */
  private broadcastEvent(event: EventType): void {
    const eventStr = JSON.stringify(event);

    for (const [userId, user] of this.users.entries()) {
      try {
        user.webSocket.send(eventStr);
      } catch (error) {
        console.error(`イベント送信エラー (${userId}):`, error);
      }
    }
  }
}

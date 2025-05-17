import type React from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { EventType } from "../types/websocket";

interface WebSocketContextType {
  connect: (roomId: string, userId: string) => void;
  disconnect: () => void;
  /** @deprecated Use sendEvent function instead */
  sendMessage: (message: Record<string, unknown>) => void;
  isConnected: boolean;
  lastEvent: EventType | null;
  connectionStatus: "connected" | "connecting" | "disconnected" | "error";
}

// RESTでイベントを送信するための関数
export const sendEvent = async (
  roomId: string,
  event: { event_type: string } & Record<string, unknown>,
) => {
  try {
    const response = await fetch(
      `https://scene-hunter-notify.yashikota.workers.dev/api/rooms/${roomId}/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...event,
          timestamp: new Date().toISOString(),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `イベント送信エラー: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    console.error("イベント送信エラー:", error);
    throw error;
  }
};

const WebSocketContext = createContext<WebSocketContextType | undefined>(
  undefined,
);

interface WebSocketProviderProps {
  children: ReactNode;
  maxReconnectAttempts?: number;
  initialBackoffDelay?: number;
  maxBackoffDelay?: number;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
  maxReconnectAttempts = 10,
  initialBackoffDelay = 1000,
  maxBackoffDelay = 30000,
}) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<EventType | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "connecting" | "disconnected" | "error"
  >("disconnected");

  // 再接続に関する状態を保持するためのRef
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const currentRoomIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const isManualDisconnectRef = useRef(false);

  // 指数バックオフを使用して次の再接続までの待機時間を計算
  const getBackoffDelay = () => {
    const delay = Math.min(
      initialBackoffDelay * (2 ** reconnectAttemptsRef.current),
      maxBackoffDelay,
    );
    // ジッターを追加して同時再接続を防止（0.5〜1.5倍のランダム係数）
    return delay * (0.5 + Math.random());
  };

  // WebSocket接続を確立する関数
  const connectWebSocket = (roomId: string, userId: string) => {
    if (socket) {
      socket.close();
    }

    // 現在の接続情報を保存
    currentRoomIdRef.current = roomId;
    currentUserIdRef.current = userId;

    setConnectionStatus("connecting");

    // 本番環境ではwssプロトコルを使用
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = "scene-hunter-notify.yashikota.workers.dev";
    const wsUrl = `${protocol}//${host}/ws/${roomId}?userId=${encodeURIComponent(userId)}`;

    console.log(`WebSocket接続を試みています: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket接続が確立されました");
      setIsConnected(true);
      setConnectionStatus("connected");
      reconnectAttemptsRef.current = 0; // 接続成功したらカウンターをリセット
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as EventType;
        console.log("メッセージを受信しました:", data);
        setLastEvent(data);
      } catch (error) {
        console.error("メッセージの解析に失敗しました:", error);
      }
    };

    ws.onclose = (event) => {
      console.log(
        `WebSocket接続が閉じられました: ${event.code} ${event.reason}`,
      );
      setIsConnected(false);
      setConnectionStatus("disconnected");

      // 手動切断の場合は再接続しない
      if (isManualDisconnectRef.current) {
        isManualDisconnectRef.current = false;
        return;
      }

      // 再接続ロジック
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = getBackoffDelay();
        console.log(
          `${delay}ms後に再接続を試みます (試行回数: ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`,
        );

        // 前回のタイムアウトをクリア
        if (reconnectTimeoutRef.current !== null) {
          window.clearTimeout(reconnectTimeoutRef.current);
        }

        // 再接続をスケジュール
        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectAttemptsRef.current += 1;

          // 保存されたroomIdとuserIdを使用して再接続
          if (currentRoomIdRef.current && currentUserIdRef.current) {
            connectWebSocket(
              currentRoomIdRef.current,
              currentUserIdRef.current,
            );
          }
        }, delay);
      } else {
        console.error("最大再接続試行回数に達しました");
        setConnectionStatus("error");
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocketエラー:", error);
      setConnectionStatus("error");
    };

    setSocket(ws);
  };

  // 公開する接続関数
  const connect = (roomId: string, userId: string) => {
    // 再接続カウンターをリセット
    reconnectAttemptsRef.current = 0;
    isManualDisconnectRef.current = false;

    connectWebSocket(roomId, userId);
  };

  // 切断関数
  const disconnect = () => {
    isManualDisconnectRef.current = true; // 手動切断フラグを設定

    // 再接続タイマーをクリア
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socket) {
      socket.close();
      setSocket(null);
      setIsConnected(false);
      setConnectionStatus("disconnected");
    }

    // 接続情報をクリア
    currentRoomIdRef.current = null;
    currentUserIdRef.current = null;
  };

  // メッセージ送信関数 (非推奨 - RESTを使用してください)
  const sendMessage = (message: Record<string, unknown>) => {
    console.warn(
      "WebSocketでのメッセージ送信は非推奨です。代わりにsendEvent関数を使用してください。",
    );
    if (socket && isConnected) {
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        console.error("メッセージ送信エラー:", error);
      }
    } else {
      console.error("WebSocketが接続されていません");
    }
  };

  // コンポーネントがアンマウントされたときにWebSocket接続を閉じる
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <WebSocketContext.Provider
      value={{
        connect,
        disconnect,
        sendMessage,
        isConnected,
        lastEvent,
        connectionStatus,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error(
      "useWebSocketはWebSocketProviderの中で使用する必要があります",
    );
  }
  return context;
};

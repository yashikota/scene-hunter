import { useEffect } from "react";
import type React from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { useWebSocket } from "../contexts/WebSocketContext";

const WaitingForPlayerPage: React.FC = () => {
  const navigate = useNavigate();
  const { lastEvent, connectionStatus } = useWebSocket();

  // WebSocketイベント処理
  useEffect(() => {
    if (lastEvent) {
      console.log("RoundMemberFirst - イベント受信:", lastEvent);

      switch (lastEvent.event_type) {
        case "game.photo_submitted":
          // 写真が提出されたら次の画面に遷移
          navigate("/roundmembersecond");
          break;

        case "game.hint_revealed":
          // ヒントが公開されたら次の画面に遷移
          navigate("/roundmembersecond");
          break;
      }
    }
  }, [lastEvent, navigate]);

  // 接続状態に応じたUIを表示
  const renderConnectionStatus = () => {
    switch (connectionStatus) {
      case "connected":
        return <span className="text-green-500 text-sm">接続済み</span>;
      case "connecting":
        return <span className="text-yellow-500 text-sm">接続中...</span>;
      case "disconnected":
        return <span className="text-gray-500 text-sm">未接続</span>;
      case "error":
        return <span className="text-red-500 text-sm">接続エラー</span>;
    }
  };

  return (
    <div className="relative min-h-screen bg-sky-100 pt-16">
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full h-16 bg-sky-300 shadow z-20 flex items-center justify-between px-4">
        <h1 className="text-xl font-bold text-gray-800">Scene Hunter</h1>
        <div>{renderConnectionStatus()}</div>
      </header>

      {/* メッセージ中央表示 */}
      <div className="flex justify-center items-center min-h-screen p-4">
        <h2 className="text-3xl font-semibold text-gray-800 text-center">
          ゲームマスターが撮影中
        </h2>
      </div>

      {/* フッター（非アクティブ） */}
      <div className="fixed bottom-0 w-full flex justify-center items-center space-x-4 h-20 bg-sky-300 z-[50] shadow-md">
        <Button
          className="w-16 h-16 rounded-full text-xl shadow-md bg-white text-black opacity-50 cursor-not-allowed"
          disabled
        >
          📸
        </Button>
      </div>
    </div>
  );
};

export default WaitingForPlayerPage;

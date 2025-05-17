import { CameraIcon } from "@heroicons/react/24/outline";
import { Dialog, DialogPortal, DialogTrigger } from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { useNavigate } from "react-router";
import { sendEvent, useWebSocket } from "../contexts/WebSocketContext";

type Player = {
  id: string;
  name: string;
};

export default function GameRoom() {
  const roomId = "012345";
  const userId = `user-${Math.random().toString(36).substring(2, 8)}`;
  const qrUrl = `https://example.com/room/${roomId}`;
  const navigate = useNavigate();

  const {
    connect,
    disconnect,
    sendMessage,
    isConnected,
    lastEvent,
    connectionStatus,
  } = useWebSocket();

  const [players, setPlayers] = useState<Player[]>([]);
  const [gameMasterId, setGameMasterId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Pacifico&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // 接続状態に応じたUIを表示
  const renderConnectionStatus = () => {
    switch (connectionStatus) {
      case "connected":
        return <span className="text-green-500">接続済み</span>;
      case "connecting":
        return <span className="text-yellow-500">接続中...</span>;
      case "disconnected":
        return <span className="text-gray-500">未接続</span>;
      case "error":
        return (
          <div className="text-red-500">
            接続エラー
            <button
              type="button"
              onClick={() => connect(roomId, userId)}
              className="ml-2 px-2 py-1 bg-blue-500 text-white rounded text-sm"
            >
              再接続
            </button>
          </div>
        );
    }
  };

  // WebSocket接続
  useEffect(() => {
    connect(roomId, userId);

    return () => {
      disconnect();
    };
  }, [connect, disconnect, userId]);

  // WebSocketイベント処理
  useEffect(() => {
    if (lastEvent) {
      console.log("イベント受信:", lastEvent);

      switch (lastEvent.event_type) {
        case "room.player_joined":
          // プレイヤー参加イベントの処理
          setPlayers((prevPlayers) => {
            const newPlayer = {
              id: lastEvent.player_id,
              name: lastEvent.name || lastEvent.player_id,
            };
            // 既に存在する場合は追加しない
            if (prevPlayers.some((p) => p.id === newPlayer.id)) {
              return prevPlayers;
            }
            return [...prevPlayers, newPlayer];
          });
          break;

        case "room.player_left":
          // プレイヤー退出イベントの処理
          setPlayers((prevPlayers) =>
            prevPlayers.filter((p) => p.id !== lastEvent.player_id),
          );
          break;

        case "room.gamemaster_changed":
          // ゲームマスター変更イベントの処理
          setGameMasterId(lastEvent.player_id);
          break;

        case "game.round_started":
          // ラウンド開始イベントの処理
          navigate("/rounddisplay");
          break;

        case "system.error":
          // エラーイベントの処理
          setErrorMessage(lastEvent.content);
          break;

        case "room.connected":
          // 接続完了イベントの処理
          console.log("ルームに接続しました:", lastEvent.content);
          break;
      }
    }
  }, [lastEvent, navigate]);

  const handleSelectGameMaster = (playerId: string) => {
    setGameMasterId(playerId); // 即時反映

    // RESTを通じてゲームマスター変更イベントを送信
    sendEvent(roomId, {
      event_type: "room.gamemaster_changed",
      player_id: playerId,
    }).catch((error) => {
      console.error("ゲームマスター変更イベント送信エラー:", error);
    });
  };

  const handleGameStartClick = () => {
    if (!gameMasterId) {
      setErrorMessage("ゲームマスターを選んでください");
      return;
    }
    setErrorMessage("");
    setShowConfirm(true);
  };

  const handleConfirmYes = () => {
    setShowConfirm(false);

    // RESTを通じてラウンド開始イベントを送信
    sendEvent(roomId, {
      event_type: "game.round_started",
      round_id: "round-1",
      start_time: new Date().toISOString(),
    }).catch((error) => {
      console.error("ラウンド開始イベント送信エラー:", error);
    });

    navigate("/rounddisplay");
  };

  const handleConfirmNo = () => {
    setShowConfirm(false);
  };

  return (
    <div className="p-6 min-h-screen bg-[#D0E2F3] text-black flex flex-col gap-6 relative">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-[Pacifico]">Scene Hunter</h1>
        <div className="flex flex-col items-end">
          <span className="text-sm text-gray-600">ルームID: {roomId}</span>
          <span className="text-sm">{renderConnectionStatus()}</span>
        </div>
      </div>

      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogTrigger asChild>
          <div className="w-20 cursor-pointer hover:scale-105 transition">
            <QRCode
              value={qrUrl}
              size={80}
              bgColor="#ffffff"
              fgColor="#111111"
            />
          </div>
        </DialogTrigger>
        <DialogPortal>
          <button
            type="button"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowQR(false)}
            onKeyDown={(e) => e.key === "Escape" && setShowQR(false)}
            aria-label="QRコードを閉じる"
          >
            <span
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="cursor-pointer"
            >
              <QRCode
                value={qrUrl}
                size={256}
                bgColor="#ffffff"
                fgColor="#111111"
              />
            </span>
          </button>
        </DialogPortal>
      </Dialog>

      <div className="text-md">ラウンド数: 3</div>

      <div>
        <h2 className="font-semibold mb-2">ゲームマスターを選択してください</h2>
        <select
          value={gameMasterId ?? ""}
          onChange={(e) => handleSelectGameMaster(e.target.value)}
          className="border rounded p-2 w-full max-w-xs"
        >
          <option value="" disabled>
            選択してください
          </option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {errorMessage && (
        <p className="text-red-600 font-bold mt-2">{errorMessage}</p>
      )}

      <button
        type="button"
        onClick={handleGameStartClick}
        disabled={players.length < 2}
        className={`px-6 py-3 rounded-2xl shadow self-start transition mt-4
          ${
            players.length < 2
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-red-500 hover:bg-red-600 text-white"
          }`}
      >
        ゲームスタート
      </button>

      <div className="mt-auto">
        <div className="text-sm text-gray-600 mb-2">
          参加者: {players.length}人
        </div>
        <ul className="list-disc pl-5 space-y-1 text-sm max-h-48 overflow-auto">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              {p.name}
              {gameMasterId === p.id && (
                <CameraIcon
                  className="w-4 h-4 text-blue-500"
                  aria-label="ゲームマスター"
                />
              )}
            </li>
          ))}
        </ul>
      </div>

      {showConfirm && (
        <button
          type="button"
          className="fixed inset-0 bg-[rgba(0,0,0,0.1)] flex flex-col justify-center items-center text-white z-50"
          onClick={handleConfirmNo}
          onKeyDown={(e) => e.key === "Escape" && handleConfirmNo()}
          aria-label="確認ダイアログを閉じる"
        >
          <dialog
            className="bg-gray-900 p-6 rounded-lg shadow-lg w-72"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-labelledby="confirm-dialog-title"
            open
          >
            <p id="confirm-dialog-title" className="mb-4 text-center">
              ゲームを始めますか？
            </p>
            <div className="flex justify-around">
              <button
                type="button"
                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600"
                onClick={handleConfirmNo}
              >
                No
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded bg-red-600 hover:bg-red-700"
                onClick={handleConfirmYes}
              >
                Yes
              </button>
            </div>
          </dialog>
        </button>
      )}
    </div>
  );
}

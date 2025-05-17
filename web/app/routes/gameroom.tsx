import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogPortal,
} from "@radix-ui/react-dialog";
import QRCode from "react-qr-code";
import { CameraIcon } from "@heroicons/react/24/outline";

type Player = {
  id: string;
  name: string;
};

export default function GameRoom() {
  const roomId = "012345";
  const qrUrl = `https://example.com/room/${roomId}`;
  const navigate = useNavigate();

  const ws = useRef<WebSocket | null>(null);

  const [players, setPlayers] = useState<Player[]>([
    { id: "1", name: "りんご" },
    { id: "2", name: "ゴリラ" },
    { id: "3", name: "ラッパ" },
  ]);
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

  useEffect(() => {
    ws.current = new WebSocket("ws://localhost:8080");

    ws.current.onopen = () => {
      console.log("WebSocket connected");
      ws.current?.send(JSON.stringify({ type: "joinRoom", roomId }));
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case "updatePlayers":
          setPlayers(message.players);
          setGameMasterId(message.gameMasterId);
          break;
        case "error":
          setErrorMessage(message.error);
          break;
      }
    };

    ws.current.onclose = () => {
      console.log("WebSocket disconnected");
    };

    return () => {
      ws.current?.close();
    };
  }, [roomId]);

  const handleSelectGameMaster = (playerId: string) => {
    setGameMasterId(playerId); // 即時反映
    ws.current?.send(
      JSON.stringify({ type: "setGameMaster", roomId, playerId }),
    );
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
    navigate("/rounddisplay");
  };

  const handleConfirmNo = () => {
    setShowConfirm(false);
  };

  return (
    <div className="p-6 min-h-screen bg-[#D0E2F3] text-black flex flex-col gap-6 relative">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-[Pacifico]">Scene Hunter</h1>
        <span className="text-sm text-gray-600">ルームID: {roomId}</span>
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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowQR(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="cursor-pointer"
            >
              <QRCode
                value={qrUrl}
                size={256}
                bgColor="#ffffff"
                fgColor="#111111"
              />
            </div>
          </div>
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
        <div
          className="fixed inset-0 bg-[rgba(0,0,0,0.1)] flex flex-col justify-center items-center text-white z-50"
          onClick={handleConfirmNo}
        >
          <div
            className="bg-gray-900 p-6 rounded-lg shadow-lg w-72"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-4 text-center">ゲームを始めますか？</p>
            <div className="flex justify-around">
              <button
                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600"
                onClick={handleConfirmNo}
              >
                No
              </button>
              <button
                className="px-4 py-2 rounded bg-red-600 hover:bg-red-700"
                onClick={handleConfirmYes}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

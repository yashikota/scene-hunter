import { CameraIcon } from "@heroicons/react/24/outline";
import {
  Dialog,
  DialogPortal,
  DialogTrigger,
} from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { useNavigate, useLocation } from "react-router";

type Player = {
  id: string;
  name: string;
};

export default function GameRoom() {
  const roomId = "012345";
  const userId = `user-${Math.random().toString(36).substring(2, 8)}`;
  const location = useLocation();
  const playerName = location.state?.playerName ?? userId;
  const qrUrl = `https://example.com/room/${roomId}`;
  const navigate = useNavigate();

  const [players, setPlayers] = useState<Player[]>([
    { id: userId, name: playerName },
  ]);
  const [gameMasterId, setGameMasterId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const gameMaster = players.find((p) => p.id === gameMasterId);

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

  const handleSelectGameMaster = (playerId: string) => {
    setGameMasterId(playerId);
    localStorage.setItem("gameMasterId", playerId); // ゲームマスターIDをlocalStorageに保存
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
    localStorage.setItem("playerId", userId); // 自分のプレイヤーIDをlocalStorageに保存
    localStorage.setItem("gameMasterId", gameMasterId!); // ゲームマスターIDも再度保存（念のため）
    navigate("/rounddisplay"); // ここはゲーム開始後の最初の画面（必要なら後で変える）
  };

  const handleConfirmNo = () => {
    setShowConfirm(false);
  };

  const handleAddDummyPlayer = () => {
    const dummyId = `user-${Math.random().toString(36).substring(2, 8)}`;
    setPlayers((prev) => [
      ...prev,
      { id: dummyId, name: `ゲスト${prev.length + 1}` },
    ]);
  };

  return (
    <div className="p-6 min-h-screen bg-[#D0E2F3] text-black flex flex-col gap-6 relative">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-[Pacifico]">Scene Hunter</h1>
        <div className="flex flex-col items-end">
          <span className="text-sm text-gray-600">ルームID: {roomId}</span>
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
        <button
          onClick={handleAddDummyPlayer}
          className="mt-4 text-sm text-blue-600 underline"
        >
          プレイヤーを追加（デモ用）
        </button>
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
            className="bg-gray-100 p-6 rounded-lg shadow-lg w-72"
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

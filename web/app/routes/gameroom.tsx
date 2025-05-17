import { useState } from "react";
import { useNavigate } from "react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import QRCode from "react-qr-code";
import { Camera } from "lucide-react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "~/components/ui/select";

const dummyPlayers = ["りんご", "ゴリラ", "ラッパ", "パーソナルコンピューター", "Elon Musk", "愛"];

export default function GameRoom() {
  const roomId = "012345";
  const players = dummyPlayers;
  const qrUrl = `https://example.com/room/${roomId}`;
  const navigate = useNavigate();

  const [gameMaster, setGameMaster] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const handleGameStart = () => {
    if (!gameMaster) {
      setErrorMessage("ゲームマスターを選んでください");
      return;
    }
    setErrorMessage("");
    setShowConfirm(true);
  };

  const handleConfirm = (ok: boolean) => {
    setShowConfirm(false);
    if (ok) navigate("/rounddisplay");
  };

  return (
    <div className="p-6 min-h-screen bg-white text-black flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Scene Hunter</h1>
        <span className="text-sm text-gray-600">ルームID: {roomId}</span>
      </div>

      {/* QRコード（小）と拡大表示 */}
      <DialogPrimitive.Root>
        <DialogPrimitive.Trigger asChild>
          <div className="w-20 cursor-pointer hover:scale-105 transition">
            <QRCode value={qrUrl} size={80} bgColor="transparent" fgColor="#000000" />
          </div>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 bg-black/30 z-50">
            <DialogPrimitive.Close asChild>
              <div className="flex items-center justify-center w-full h-full">
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.9)",
                    padding: "1rem",
                    borderRadius: "0.5rem",
                  }}
                >
                  <QRCode value={qrUrl} size={256} bgColor="transparent" fgColor="#000000" />
                </div>
              </div>
            </DialogPrimitive.Close>
          </DialogPrimitive.Overlay>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="text-md">ラウンド数: 3</div>

      <div>
        <h2 className="font-semibold mb-2">ゲームマスターを選択してください</h2>
        <Select onValueChange={(val) => setGameMaster(val)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="選択してください" />
          </SelectTrigger>
          <SelectContent>
            {players.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {gameMaster && (
          <div className="mt-2 text-blue-600 text-sm">ゲームマスター: {gameMaster}</div>
        )}
      </div>

      {errorMessage && (
        <p className="text-red-600 font-bold">{errorMessage}</p>
      )}

      <button
        onClick={handleGameStart}
        disabled={players.length < 2}
        className={`px-6 py-3 rounded-2xl shadow self-start transition
          ${players.length < 2 ? "bg-gray-400 cursor-not-allowed" : "bg-red-500 hover:bg-red-600 text-white"}`}
      >
        ゲームスタート
      </button>

      {showConfirm && (
        <DialogPrimitive.Root open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
              <div className="bg-white p-6 rounded-xl shadow-xl text-center space-y-4">
                <h2 className="text-lg font-bold">ゲームを始めますか？</h2>
                <div className="flex justify-center gap-4">
                  <button onClick={() => handleConfirm(false)} className="px-4 py-2 bg-gray-300 rounded">No</button>
                  <button onClick={() => handleConfirm(true)} className="px-4 py-2 bg-blue-500 text-white rounded">Yes</button>
                </div>
              </div>
            </DialogPrimitive.Overlay>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}

      <div className="mt-auto">
        <div className="text-sm text-gray-600 mb-2">参加者: {players.length}人</div>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          {players.map((name) => (
            <li key={name} className="flex items-center gap-1">
              {name}
              {gameMaster === name && (
                <Camera className="w-4 h-4 text-blue-500" aria-label="ゲームマスター" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
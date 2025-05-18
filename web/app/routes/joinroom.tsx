import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

export default function JoinRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const [roomId, setRoomId] = useState("");
  const [playerName, setPlayerName] = useState("");

  // URLクエリからroomIdを取得
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const idFromQR = params.get("roomId");
    if (idFromQR) setRoomId(idFromQR);
  }, [location.search]);

  const handleJoin = () => {
    if (!playerName.trim() || !roomId.trim()) return;
    // WebSocket なしで直接遷移
    navigate("/gameroom", { state: { playerName, roomId } });
  };

  return (
    <div className="min-h-screen bg-[#D0E2F3] flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold mb-6 font-[Pacifico] text-black">
        Scene Hunter
      </h1>

      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-md space-y-6">
        <div>
          <label htmlFor="roomId" className="block text-sm font-medium text-gray-700 mb-2">
            ルームIDを入力してください
          </label>
          <input
            id="roomId"
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="ルームID"
            className="w-full p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="playerName" className="block text-sm font-medium text-gray-700 mb-2">
            プレイヤー名を入力してください
          </label>
          <input
            id="playerName"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="プレイヤー名"
            className="w-full p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* ゲームに参加ボタン - オレンジ */}
        <button
          onClick={handleJoin}
          disabled={!playerName.trim() || !roomId.trim()}
          className={`w-full py-3 rounded-2xl font-semibold transition
            ${
              playerName.trim() && roomId.trim()
                ? "bg-[#F6B26B] text-black hover:bg-[#e5a15b]"
                : "bg-[#fcd9b0] text-gray-500 cursor-not-allowed"
            }`}
        >
          ゲームに参加
        </button>

        {/* 戻るボタン - 青 */}
        <button
          onClick={() => navigate("/room")}
          className="w-full py-3 rounded-2xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          ゲームルームホームへ戻る
        </button>
      </div>
    </div>
  );
}

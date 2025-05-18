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

  // バリデーション
  const isValidRoomId = /^\d{6}$/.test(roomId); // 数字6桁
  const isValidPlayerName =
    playerName.trim().length > 0 && playerName.trim().length <= 12;

  const handleJoin = async () => {
    if (!playerName) return;
    const playerId = `user-${Math.random().toString(36).substring(2, 8)}`;
    try {
      const response = await fetch(`http://localhost:4282/rooms/${roomId}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          player_id: playerId,
          room_code: roomId,
        }),
      });
      if (response.ok) {
        navigate("/gameroom");
      } else {
        // エラー処理（必要に応じてアラート等を追加）
      }
    } catch (error) {
      // ネットワークエラー等の処理
    }
  };

  return (
    <div className="min-h-screen bg-[#D0E2F3] flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold mb-6 font-[Pacifico] text-black">
        Scene Hunter
      </h1>

      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-md space-y-6">
        <div>
          <label
            htmlFor="roomId"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            ルームIDを入力してください
          </label>
          <input
            id="roomId"
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="ルームID（6桁の数字）"
            className="w-full p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="playerName"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            プレイヤー名を入力してください（1〜12文字）
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

        {/* ゲームに参加ボタン */}
        <button
          onClick={handleJoin}
          disabled={!isValidRoomId || !isValidPlayerName}
          className={`w-full py-3 rounded-2xl font-semibold transition ${
            isValidRoomId && isValidPlayerName
              ? "bg-[#F6B26B] text-black hover:bg-[#e5a15b]"
              : "bg-[#fcd9b0] text-gray-500 cursor-not-allowed"
          }`}
        >
          ゲームに参加
        </button>

        {/* 戻るボタン */}
        <button
          onClick={() => navigate("/room")}
          className="w-full py-3 rounded-2xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          ホームへ戻る
        </button>
      </div>
    </div>
  );
}

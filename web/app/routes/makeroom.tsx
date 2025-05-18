import { useState } from "react";
import { useNavigate } from "react-router";

export default function MakeRoom() {
  const [playerName, setPlayerName] = useState("");
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    if (!playerName.trim()) return;

    // ルームIDやWebSocket連携などが必要であればここで生成・送信する
    // ここでは仮に "012345" に遷移する前提で進めます

    navigate("/gameroom", { state: { playerName } });
  };

  return (
    <div className="min-h-screen bg-[#D0E2F3] flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold mb-6 font-[Pacifico] text-black">
        Scene Hunter
      </h1>

      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-md space-y-6">
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

        <button
          onClick={handleCreateRoom}
          disabled={!playerName.trim()}
          className={`w-full py-3 rounded-2xl font-semibold transition ${
            playerName.trim()
              ? "bg-[#E59842] text-black hover:bg-[#e5a15b]"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
        >
          ルーム作成
        </button>

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

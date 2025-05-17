import { useState } from "react";
import { useNavigate } from "react-router";

export default function MakeRoom() {
  const [playerName, setPlayerName] = useState("");
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    if (!playerName) return;
    // TODO: ルーム作成処理。プレイヤー名を状態管理やDBに保存するなど
    navigate("/gameroom"); // ルーム作成後に遷移
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-white text-black">
      <h1 className="text-3xl font-bold mb-6">ルーム作成</h1>

      <input
        type="text"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        placeholder="プレイヤー名を入力"
        className="border rounded-xl px-4 py-2 mb-4 w-64 text-center"
      />

      <button
        onClick={handleCreateRoom}
        className="px-6 py-3 bg-blue-500 text-white rounded-2xl shadow hover:bg-blue-600 transition"
      >
        ルームを作成する
      </button>

      <button
        onClick={() => navigate("/room")}
        className="mt-4 text-blue-700 underline"
      >
        戻る
      </button>
    </div>
  );
}

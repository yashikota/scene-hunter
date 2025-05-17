import { useState } from "react";
import { useNavigate } from "react-router";

export default function MakeRoom() {
  const [playerName, setPlayerName] = useState("");
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    if (!playerName) return;
    navigate("/gameroom");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#D0E2F3] text-black">
      <h1 className="text-4xl font-[Pacifico] mb-6">Scene Hunter</h1>

      <input
        type="text"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        placeholder="プレイヤー名を入力"
        className="border rounded-xl px-4 py-2 mb-4 w-64 text-center"
      />

      <button
        onClick={handleCreateRoom}
        className="px-6 py-3 bg-[#EEEEEE] text-black rounded-2xl shadow hover:bg-gray-300 transition"
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


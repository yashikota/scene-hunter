import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

export default function MakeRoom() {
  const [playerName, setPlayerName] = useState("");
  const navigate = useNavigate();

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

  const handleCreateRoom = () => {
    if (!playerName) return;
    navigate("/gameroom");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#D0E2F3] text-black">
      <h1
        className="text-4xl text-gray-800 mb-6"
        style={{ fontFamily: '"Pacifico", cursive' }}
      >
        Scene Hunter
      </h1>

      <input
        type="text"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        placeholder="プレイヤー名を入力"
        className="border rounded-xl px-4 py-2 mb-4 w-64 text-center bg-white"
      />

      <button
        onClick={handleCreateRoom}
        className="px-6 py-3 bg-[#F6B26B] text-black rounded-2xl shadow hover:bg-[#e5a15b] transition"
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

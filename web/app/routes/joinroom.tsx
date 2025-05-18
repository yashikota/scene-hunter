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
    if (!playerName) return;
    navigate("/gameroom");
  };

  return (
    <div className="p-6 bg-[#D0E2F3] min-h-screen">
      <h1 className="text-2xl mb-4">プレイヤー名を入力</h1>
      <input
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        placeholder="プレイヤー名"
        className="border p-2 mb-4 block w-full max-w-sm"
      />
      <button
        type="button"
        onClick={handleJoin}
        disabled={!playerName}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
      >
        ゲームに参加
      </button>
    </div>
  );
}

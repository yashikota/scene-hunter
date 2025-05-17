import { useNavigate } from "react-router";

export default function GameHome() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4 bg-white text-black">
      <h1 className="text-4xl font-bold mb-8">Scene Hunter</h1>

      <button
        onClick={() => navigate("/create")}
        className="px-6 py-3 bg-blue-500 text-white rounded-2xl shadow hover:bg-blue-600 transition"
      >
        ルーム作成
      </button>

      <button
        onClick={() => navigate("/join")}
        className="px-6 py-3 bg-green-500 text-white rounded-2xl shadow hover:bg-green-600 transition"
      >
        ルーム参加
      </button>

      <button
        onClick={() => navigate("/how-to-play")}
        className="px-6 py-3 bg-gray-500 text-white rounded-2xl shadow hover:bg-gray-600 transition"
      >
        ルール説明
      </button>
    </div>
  );
}

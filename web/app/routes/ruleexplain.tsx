import { useEffect } from "react";
import { useNavigate } from "react-router";

export default function RuleExplain() {
  const navigate = useNavigate();

  // Pacifico フォント読み込みよ
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

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 pt-16 bg-blue-100">
      {/* ロゴ */}
      <h1
        className="text-3xl text-gray-800 text-center mb-4"
        style={{ fontFamily: '"Pacifico", cursive' }}
      >
        Scene Hunter
      </h1>

      {/* カード風 説明部分 */}
      <div className="bg-white shadow-md rounded-lg p-6 w-full max-w-md mb-6">
        <img
          src="/howto.png"
          alt="ルール説明"
          className="w-full h-auto rounded-lg mb-4"
        />
      </div>

      {/* ボタン */}
      <button
        type="button"
        onClick={() => navigate("/room")}
        className="bg-orange-300 hover:bg-orange-400 text-black font-semibold px-6 py-2 rounded shadow"
      >
        ゲームホームに戻る
      </button>
    </main>
  );
}

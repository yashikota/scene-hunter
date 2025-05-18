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
        <h2 className="text-xl font-bold text-center mb-4">ゲーム説明</h2>
        <div className="text-sm space-y-3">
          <p>このゲームはゲームマスターが撮った写真を当てるゲームです！</p>
          <p>・ゲームの目的は〜〜〜です。</p>
          <p>・プレイヤーは〜〜〜の手順で進行します。</p>
          <p>・得点の計算方法は〜〜〜となります。</p>
          <p>・その他の注意事項やヒントをここに記載してください。</p>
        </div>
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

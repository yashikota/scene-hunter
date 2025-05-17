import { useNavigate } from "react-router";

export default function RuleExplain() {
  const navigate = useNavigate();

  return (
    <div className="max-w-xl mx-auto p-6 min-h-screen bg-[#D0E2F3] text-black flex flex-col">
      <h1 className="text-4xl font-[Pacifico] mb-6 text-center">
        Scene Hunter
      </h1>

      <div className="flex-grow overflow-auto mb-6">
        <p className="mb-4">
          このゲームはゲームマスターが撮った写真を当てるゲームです！
        </p>
        <p className="mb-4">・ゲームの目的は〜〜〜です。</p>
        <p className="mb-4">・プレイヤーは〜〜〜の手順で進行します。</p>
        <p className="mb-4">・得点の計算方法は〜〜〜となります。</p>
        <p className="mb-4">
          ・その他の注意事項やヒントをここに記載してください。
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate("/room")}
        className="px-6 py-3 bg-[#EEEEEE] text-black rounded-2xl shadow hover:bg-gray-300 transition self-center"
      >
        ゲームホームに戻る
      </button>
    </div>
  );
}

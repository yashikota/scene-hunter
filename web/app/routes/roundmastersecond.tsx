import React from "react";
import { Button } from "../components/ui/button";

const WaitingForPlayerPage: React.FC = () => {
  return (
    <div className="relative min-h-screen bg-sky-100 pt-16">
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full h-16 bg-sky-300 shadow z-20 flex items-center justify-center">
        <h1 className="text-xl font-bold text-gray-800">Scene Hunter</h1>
      </header>

      {/* メッセージ中央表示 */}
      <div className="flex justify-center items-center min-h-screen p-4">
        <h2 className="text-3xl font-semibold text-gray-800 text-center">
          プレイヤーが撮影中
        </h2>
      </div>

      {/* フッター（非アクティブ） */}
      <div className="fixed bottom-0 w-full flex justify-center items-center space-x-4 h-20 bg-sky-300 z-[50] shadow-md">
        <Button 
          className="w-16 h-16 rounded-full text-xl shadow-md bg-white text-black opacity-50 cursor-not-allowed" 
          disabled 
        >
          📸
        </Button>
      </div>
    </div>
  );
};

export default WaitingForPlayerPage;

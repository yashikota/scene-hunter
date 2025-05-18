import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

export default function GameHome() {
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
    <div className="relative flex items-center justify-center min-h-screen bg-blue-100 p-4">
      {/* 左下カメラ画像 */}
      <img
        src="/icon.png"
        alt="camera icon"
        className="absolute bottom-4 left-4 w-20 h-20 object-contain"
      />

      <Card className="w-full max-w-md shadow-xl border border-gray-300 bg-white">
        <CardContent className="flex flex-col items-center gap-6 py-10">
          <h1
            className="text-4xl text-gray-800"
            style={{ fontFamily: '"Pacifico", cursive' }}
          >
            Scene Hunter
          </h1>

          <Button
            className="w-64 text-lg bg-[#EEEEEE] text-black hover:bg-gray-300"
            onClick={() => navigate("/create")}
          >
            ルーム作成
          </Button>

          <Button
            className="w-64 text-lg bg-[#EEEEEE] text-black hover:bg-gray-300"
            onClick={() => navigate("/join")}
          >
            ルーム参加
          </Button>

          <Button
            className="w-64 text-lg bg-[#EEEEEE] text-black hover:bg-gray-300"
            onClick={() => navigate("/how-to-play")}
          >
            ゲーム説明
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

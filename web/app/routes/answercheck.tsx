import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ScrollArea } from "../components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Timer } from "../components/ui/timer";

// 型定義
interface PlayerResult {
  player_id: string;
  name: string;
  similarity: number; // 一致率（%）
  time: number; // 撮影時間（秒）
  score: number; // 得点
  image_url: string;
}

export default function AnswerCheckPage() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<PlayerResult[]>([]);
  const [loading, setLoading] = useState(true);

  const gmImageUrl = "https://scene-hunter-image.yashikota.workers.dev/file/test.jpg"; // GMの画像

  // 仮の参加者データ
  const dummyResults: PlayerResult[] = [
    {
      player_id: "1",
      name: "Alice",
      similarity: 98,
      time: 3.0,
      score: 100,
      image_url: gmImageUrl,
    },
    {
      player_id: "2",
      name: "Bob",
      similarity: 92,
      time: 2.8,
      score: 95,
      image_url: gmImageUrl,
    },
    {
      player_id: "3",
      name: "Carol",
      similarity: 85,
      time: 4.0,
      score: 90,
      image_url: gmImageUrl,
    },
    {
      player_id: "4",
      name: "You",
      similarity: 75,
      time: 3.5,
      score: 80,
      image_url: gmImageUrl,
    },
  ];

  useEffect(() => {
    setTimeout(() => {
      setPlayers(dummyResults.sort((a, b) => b.score - a.score));
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="relative flex flex-col items-center min-h-screen px-4 pt-25 bg-blue-50">
      <Timer seconds={10} onComplete={() => navigate("/interimresult1")} />
      <h1 className="text-3xl font-bold">Scene Hunter</h1>
      <h2 className="text-xl mt-2">答え合わせ</h2>

      {/* GM画像 */}
      <div className="mt-10">
        <h3 className="text-md font-semibold text-center mb-2">Game Master</h3>
        <img src={gmImageUrl} alt="GM" className="w-48 h-auto rounded shadow" />
      </div>

      {/* プレイヤー結果 */}
      <div className="w-full max-w-md mt-8">
        <ScrollArea className="h-[280px] border rounded p-4 bg-white">
          <ul className="space-y-4 pr-2">
            {players.map((player, i) => (
              <li key={player.player_id} className="flex items-center gap-4">
                <img
                  src={player.image_url}
                  alt={player.name}
                  className="w-24 h-auto rounded shadow"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar>
                      <AvatarImage
                        src={`https://api.dicebear.com/7.x/icons/svg?seed=${player.player_id}`}
                        alt={player.name}
                      />
                      <AvatarFallback>
                        {player.name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-semibold">{player.name}</span>
                  </div>
                  <p className="text-sm">一致率: {player.similarity}%</p>
                  <p className="text-sm">撮影時間: {player.time.toFixed(1)}秒</p>
                  <p className="text-sm">得点: {player.score}点</p>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </div>

      {/* 中間発表へ */}
      {/* <div className="mt-6">
        <button
          type="button"
          onClick={() => navigate("/interimresult1")}
          className="bg-orange-300 hover:bg-orange-400 px-6 py-2 rounded shadow"
        >
          中間発表へ
        </button>
      </div> */}
    </main>
  );
}

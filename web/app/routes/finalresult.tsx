import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "~/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Progress } from "../components/ui/progress";
import { ScrollArea } from "../components/ui/scroll-area";

type Player = {
  player_id: string;
  name: string;
  total_score: number;
  rank: number;
};

export default function FinalResultPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [players, setPlayers] = useState<Player[]>([]);

  const yourId = "4"; // ← あなたのプレイヤーIDよ
  const round = 3;

  const dummyPlayers: Player[] = [
    { player_id: "1", name: "Alice", total_score: 310.25, rank: 1 },
    { player_id: "2", name: "Bob", total_score: 298.5, rank: 2 },
    { player_id: "3", name: "Carol", total_score: 265.75, rank: 3 },
    { player_id: "4", name: "You", total_score: 260.0, rank: 4 },
    { player_id: "5", name: "Dave", total_score: 245.0, rank: 5 },
    { player_id: "6", name: "Eve", total_score: 240.5, rank: 6 },
    { player_id: "7", name: "Frank", total_score: 230.75, rank: 7 },
    { player_id: "8", name: "Grace", total_score: 225.0, rank: 8 },
    { player_id: "9", name: "Heidi", total_score: 210.3, rank: 9 },
    { player_id: "10", name: "Ivan", total_score: 199.9, rank: 10 },
    { player_id: "11", name: "Jon", total_score: 189.9, rank: 11 },
  ];

  useEffect(() => {
    let value = 0;
    const interval = setInterval(() => {
      value += 10;
      setProgress(value);
      if (value >= 100) clearInterval(interval);
    }, 100);

    setTimeout(() => {
      setPlayers(dummyPlayers);
      setLoading(false);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const sorted = [...players].sort((a, b) => a.rank - b.rank);
  const podium = [sorted[0], sorted[1], sorted[2]];
  const yourRank = players.find((p) => p.player_id === yourId)?.rank || "-";

  const handlePlayAgain = () => {
    navigate("/gameroom");
  };

  const handleReturnHome = () => {
    navigate("/room");
  };

  if (loading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-4">
        <p className="mb-4 text-gray-600 text-center">最終結果を集計中...</p>
        <div className="w-full max-w-xs h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 pt-15 bg-blue-100">
      <h1 className="text-3xl font-bold">Scene Hunter</h1>
      <h3 className="text-lg mt-4 font-semibold">最終結果発表</h3>

      {/* Podium */}
      <div className="flex justify-center items-end h-25 gap-6 mt-6">
        <div className="flex flex-col items-center">
          <div className="bg-teal-900 text-white w-10 h-16 flex items-center justify-center text-sm">
            3
          </div>
          <span className="text-xs mt-1">{podium[2]?.name}</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="bg-teal-900 text-white w-10 h-24 flex items-center justify-center text-sm">
            1
          </div>
          <span className="text-xs mt-1">{podium[0]?.name}</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="bg-teal-900 text-white w-10 h-20 flex items-center justify-center text-sm">
            2
          </div>
          <span className="text-xs mt-1">{podium[1]?.name}</span>
        </div>
      </div>

      <p className="mt-4 text-sm">あなたは... {yourRank} 位！</p>

      {/* ランキング一覧 */}
      <div className="w-full max-w-xs mt-6 text-sm">
        <h4 className="font-semibold">ランキング</h4>
        <ScrollArea className="mt-2 bg-white border rounded">
          <div className="max-h-[200px] overflow-auto pr-2">
            <ul className="space-y-2 p-2">
              {sorted.map((p) => {
                const medal =
                  p.rank === 1
                    ? "🥇"
                    : p.rank === 2
                      ? "🥈"
                      : p.rank === 3
                        ? "🥉"
                        : "";

                return (
                  <li
                    key={p.player_id}
                    className={cn(
                      "flex items-center justify-between gap-2",
                      p.player_id === yourId && "bg-yellow-50 font-bold",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar>
                        <AvatarImage
                          src={`https://api.dicebear.com/7.x/icons/svg?seed=${p.player_id}`}
                          alt={p.name}
                        />
                        <AvatarFallback>
                          {p.name[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex items-center gap-1">
                        {p.rank}. {p.name}
                        {medal && <span className="ml-1">{medal}</span>}
                      </span>
                    </div>
                    <span>{p.total_score.toFixed(2)} pts</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </ScrollArea>
      </div>

      {/* もう一度遊ぶ & ホームへ戻る */}
      <div className="mt-6 bg-white p-4 rounded shadow text-center">
        <div className="flex gap-4 justify-center">
          <button
            type="button"
            onClick={handlePlayAgain}
            className="bg-blue-300 hover:bg-blue-400 px-4 py-2 rounded"
          >
            もう一度遊ぶ
          </button>
          <button
            type="button"
            onClick={handleReturnHome}
            className="bg-orange-300 hover:bg-orange-400 px-4 py-2 rounded"
          >
            ホームへ戻る
          </button>
        </div>
      </div>
    </main>
  );
}

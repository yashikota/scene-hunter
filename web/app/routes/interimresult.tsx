import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Progress } from "../components/ui/progress";
// import type { Ranking } from "../lib/types";

export default function InterimResultPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  const [round] = useState(2);
  const [yourRank] = useState(3);
  const [podium] = useState<[string, string, string]>(["Alice", "Bob", "You"]);
  const [rankings] = useState<Ranking[]>([
    { name: "Alice", points: 250 },
    { name: "Bob", points: 210 },
    { name: "You", points: 195 },
  ]);

  useEffect(() => {
    let value = 0;
    const interval = setInterval(() => {
      value += 10;
      setProgress(value);
      if (value >= 100) {
        clearInterval(interval);
        setLoading(false);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleNextRound = () => {
    navigate("/play"); // 任意のプレイページへ
  };

  if (loading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-4">
        <p className="mb-4 text-gray-600 text-center">中間発表を準備中...</p>
        <Progress value={progress} />
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 bg-blue-50">
      <h1 className="text-3xl font-bold">Scene Hunter</h1>
      <h2 className="text-xl mt-2">Round {round}</h2>
      <h3 className="text-lg mt-4 font-semibold">中間発表</h3>
      <p className="text-sm mt-1">これは１２文字なんです！</p>

      {/* Podium */}
      <div className="flex justify-center items-end h-40 gap-6 mt-6">
        {[
          { rank: 3, name: podium[2], height: "h-16" },
          { rank: 1, name: podium[0], height: "h-24" },
          { rank: 2, name: podium[1], height: "h-20" },
        ].map((p, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className={`bg-teal-900 text-white w-10 ${p.height} flex items-center justify-center`}>
              {p.rank}
            </div>
            <span className="text-xs mt-1">{p.name}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm">あなたは・・・・ {yourRank} 位！</p>

      {/* ランキング */}
      <div className="w-full max-w-xs mt-6 text-sm">
        <h4 className="font-semibold">Ranking</h4>
        <ul className="mt-2 bg-white border rounded p-2 space-y-1">
          {rankings.map((r, i) => (
            <li key={i} className="flex justify-between">
              <span>{i + 1}. {r.name}</span>
              <span>{r.points} pts</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Next Round */}
      <div className="mt-6 bg-white p-4 rounded shadow text-center">
        <p className="text-md font-bold mb-2">Next Round<br />{round + 1} / 3</p>
        <button onClick={handleNextRound} className="bg-orange-300 hover:bg-orange-400 px-4 py-2 rounded">
          確定
        </button>
      </div>
    </main>
  );
}
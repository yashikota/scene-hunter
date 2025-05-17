import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Progress } from "../components/ui/progress";
// import type { Ranking } from "../lib/types";

export default function FinalResultPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  const [yourRank] = useState(1);
  const [podium] = useState<[string, string, string]>(["You", "Bob", "Alice"]);
  const [rankings] = useState<Ranking[]>([
    { name: "You", points: 300 },
    { name: "Bob", points: 290 },
    { name: "Alice", points: 270 },
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

  const handleReturnHome = () => {
    navigate("/");
  };

  if (loading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-4">
        <p className="mb-4 text-gray-600 text-center">最終結果を集計中...</p>
        <Progress value={progress} />
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 bg-blue-50">
      <h1 className="text-3xl font-bold">Scene Hunter</h1>
      <h2 className="text-xl mt-2">Round 3</h2>
      <h3 className="text-lg mt-4 font-semibold">結果発表</h3>
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

      {/* Return Home */}
      <div className="mt-6 bg-white p-4 rounded shadow text-center">
        <button onClick={handleReturnHome} className="bg-orange-300 hover:bg-orange-400 px-4 py-2 rounded">
          ホームへ戻る
        </button>
      </div>
    </main>
  );
}
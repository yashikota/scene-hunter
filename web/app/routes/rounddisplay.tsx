"use client";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

export default function RoundDisplay() {
  const [roundNumber, setRoundNumber] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const navigate = useNavigate();

  // フォールバックとして3秒後に自動遷移
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/roundmemberfirst");
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  // 接続状態UI削除
  const renderConnectionStatus = () => null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#D0E2F3] text-black">
      <div className="absolute top-4 right-4">{renderConnectionStatus()}</div>
      <h1 className="text-4xl font-[Pacifico]">
        ラウンド {roundNumber} / {totalRounds}
      </h1>
    </div>
  );
}

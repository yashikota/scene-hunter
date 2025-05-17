"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router";

export default function RoundDisplay() {
  const roundNumber = 1; // 今は1ラウンド目固定。必要ならpropsやcontextで動的にしてね
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/roundmenberfirst");
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-white text-black">
      <h1 className="text-4xl font-bold">ラウンド {roundNumber}   /3</h1>
    </div>
  );
}

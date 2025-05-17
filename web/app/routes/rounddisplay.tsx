"use client";
import { useEffect } from "react";
import { useNavigate } from "react-router";

export default function RoundDisplay() {
  const roundNumber = 1;
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/roundmenberfirst");
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#D0E2F3] text-black">
      <h1 className="text-4xl font-[Pacifico]">ラウンド {roundNumber} / 3</h1>
    </div>
  );
}

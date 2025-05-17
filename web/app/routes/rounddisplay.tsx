"use client";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useWebSocket } from "../contexts/WebSocketContext";

export default function RoundDisplay() {
  const [roundNumber, setRoundNumber] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const navigate = useNavigate();
  const { lastEvent, connectionStatus } = useWebSocket();

  // WebSocketイベント処理
  useEffect(() => {
    if (lastEvent) {
      console.log('RoundDisplay - イベント受信:', lastEvent);

      switch (lastEvent.event_type) {
        case 'game.round_started':
          // ラウンド情報を更新
          if (lastEvent.round_id) {
            // round_idから数値を抽出（例: "round-1" -> 1）
            const match = lastEvent.round_id.match(/\d+/);
            if (match) {
              setRoundNumber(parseInt(match[0], 10));
            }
          }
          break;

        case 'game.hint_revealed':
          // ヒントが公開されたら次の画面に遷移
          navigate("/roundmemberfirst");
          break;
      }
    }
  }, [lastEvent, navigate]);

  // フォールバックとして3秒後に自動遷移
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/roundmemberfirst");
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  // 接続状態に応じたUIを表示
  const renderConnectionStatus = () => {
    switch (connectionStatus) {
      case 'connected':
        return <span className="text-green-500 text-sm">接続済み</span>;
      case 'connecting':
        return <span className="text-yellow-500 text-sm">接続中...</span>;
      case 'disconnected':
        return <span className="text-gray-500 text-sm">未接続</span>;
      case 'error':
        return <span className="text-red-500 text-sm">接続エラー</span>;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#D0E2F3] text-black">
      <div className="absolute top-4 right-4">
        {renderConnectionStatus()}
      </div>
      <h1 className="text-4xl font-[Pacifico]">ラウンド {roundNumber} / {totalRounds}</h1>
    </div>
  );
}

import React, { useEffect, useState } from 'react';

// APIレスポンスの型
interface MasterIdResponse {
  masterId: string;
}

const RoundDisplay: React.FC = () => {
  const [masterId, setMasterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 現在のゲームマスターIDを取得する関数
  async function fetchCurrentMasterId(): Promise<string> {
    const response = await fetch('/api/get-current-master-id');
    if (!response.ok) {
      throw new Error('API error');
    }
    const data: MasterIdResponse = await response.json();
    return data.masterId;
  }

  useEffect(() => {
    fetchCurrentMasterId()
      .then(id => {
        setMasterId(id);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div>読み込み中...</div>;
  }

  if (error) {
    return <div>エラー: {error}</div>;
  }

  // プレイヤーIDを取得（ここは適宜変更してください）
  const currentPlayerId = localStorage.getItem('playerId') || '';

  // ゲームマスターならroundmasterfirst.tsxの中身を表示、それ以外はroundmemberfirst.tsxの中身を表示
  if (currentPlayerId === masterId) {
    return <RoundMasterFirst />;
  } else {
    return <RoundMemberFirst />;
  }
};

// 仮のゲームマスター画面コンポーネント
const RoundMasterFirst: React.FC = () => {
  return <div>【ゲームマスター画面】ここにゲームマスター用UIを実装</div>;
};

// 仮のメンバー画面コンポーネント
const RoundMemberFirst: React.FC = () => {
  return <div>【メンバー画面】ここにメンバー用UIを実装</div>;
};

export default RoundDisplay;

-- プレイヤーテーブルの作成
CREATE TABLE players (
  player_id TEXT PRIMARY KEY,  -- UUIDv7
  name TEXT NOT NULL,          -- プレイヤー名（1-12文字）
  created_at INTEGER NOT NULL, -- 作成日時（UNIXタイムスタンプ）
  total_score INTEGER DEFAULT 0 -- 総スコア
);

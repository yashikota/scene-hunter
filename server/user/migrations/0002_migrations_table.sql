-- マイグレーション履歴テーブルの作成
CREATE TABLE migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

-- 既存のマイグレーションを記録
INSERT INTO migrations (name, applied_at) VALUES ('0000_initial.sql', unixepoch());
INSERT INTO migrations (name, applied_at) VALUES ('0001_add_indexes.sql', unixepoch());

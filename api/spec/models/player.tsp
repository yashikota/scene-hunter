import "./common.tsp";

namespace SceneHunter.Models;

/**
 * プレイヤー
 */
model Player {
  /** プレイヤーID */
  player_id: UUID;

  /** プレイヤー名 */
  name: string;

  /** 作成日時 */
  created_at: Timestamp;

  /** 総スコア */
  total_score: int32;
}

/**
 * プレイヤー名更新リクエスト
 */
model UpdatePlayerNameRequest {
  /** プレイヤー名（1-12文字） */
  name: string;
}

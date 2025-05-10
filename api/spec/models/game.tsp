import "./common.tsp";

namespace SceneHunter.Models;

/**
 * ラウンドの状態
 */
enum RoundState {
  /** 待機中 */
  waiting,

  /** マスターターン */
  master_turn,

  /** ハンターターン */
  hunter_turn,

  /** 終了 */
  finished,
}

/**
 * ラウンド開始リクエスト
 */
model StartRoundRequest {
  /** ゲームマスターID */
  gamemaster_id: UUID;
}

/**
 * ラウンド開始レスポンス
 */
model StartRoundResponse {
  /** ラウンドID */
  round_id: UUID;

  /** 開始時間 */
  start_time: Timestamp;
}

/**
 * プレイヤースコア
 */
model PlayerScore {
  /** プレイヤーID */
  player_id: UUID;

  /** プレイヤー名 */
  name: string;

  /** 一致スコア */
  match_score: float32;

  /** 残り秒数 */
  remaining_seconds: int32;

  /** 合計スコア */
  total_score: float32;
}

/**
 * ラウンド結果
 */
model RoundResult {
  /** ラウンドID */
  round_id: UUID;

  /** スコアリスト */
  scores: PlayerScore[];

  /** 勝者ID */
  winner: UUID;
}

/**
 * 写真提出レスポンス
 */
model PhotoSubmissionResponse {
  /** 写真ID */
  photo_id: UUID;

  /** 提出時間 */
  submission_time: Timestamp;
}

/**
 * リーダーボードエントリ
 */
model LeaderboardEntry {
  /** プレイヤーID */
  player_id: UUID;

  /** プレイヤー名 */
  name: string;

  /** 合計スコア */
  total_score: float32;

  /** 順位 */
  rank: int32;
}

/**
 * リーダーボード
 */
model Leaderboard {
  /** プレイヤーリスト */
  players: LeaderboardEntry[];
}

/**
 * プレイヤー提出物
 */
model PlayerSubmission {
  /** プレイヤーID */
  player_id: UUID;

  /** 写真ID */
  photo_id: UUID;

  /** 提出時間 */
  submission_time: Timestamp;

  /** 残り秒数 */
  remaining_seconds: int32;

  /** 一致スコア */
  match_score: float32;

  /** 合計スコア */
  total_score: float32;
}

/**
 * ラウンドモデル
 */
model Round {
  /** ラウンドID */
  round_id: UUID;

  /** ルームID */
  room_id: UUID;

  /** ラウンド番号 */
  round_number: int32;

  /** 開始時間 */
  start_time: Timestamp;

  /** 終了時間 */
  end_time: Timestamp;

  /** 状態 */
  state: RoundState;

  /** マスター写真ID */
  master_photo_id: UUID;

  /** ヒントリスト */
  hints: string[];

  /** 公開済みヒント数 */
  revealed_hints: int32;

  /** 提出物リスト */
  submissions: PlayerSubmission[];
}

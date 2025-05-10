import "./common.tsp";

namespace SceneHunter.Models;

/**
 * 画像分析リクエスト
 */
model AnalyzeImageRequest {
  /** 画像ID */
  image_id: UUID;
}

/**
 * 画像分析レスポンス
 */
model AnalyzeImageResponse {
  /** 処理時間（ミリ秒） */
  processing_time_ms: int32;

  /** 抽出されたヒント（ゲームマスターのみ取得可能） */
  hints?: string[];
}

/**
 * ラウンドヒント
 */
model RoundHints {
  /** 公開済みヒントリスト */
  revealed_hints: string[];

  /** 公開済みヒント数 */
  revealed_count: int32;

  /** 合計ヒント数 */
  total_count: int32;

  /** 次のヒント公開までの残り時間（秒） */
  next_reveal_in_seconds?: int32;
}

/**
 * AI情報
 */
model AiInfo {
  /** モデル名 */
  model_name: string;

  /** モデルバージョン */
  model_version: string;

  /** 状態 */
  status: "ready" | "busy" | "error";
}

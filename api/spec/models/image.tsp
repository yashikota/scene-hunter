import "./common.tsp";

namespace SceneHunter.Models;

/**
 * 画像メタデータ
 */
model ImageMetadata {
  /** 幅 */
  width: int32;

  /** 高さ */
  height: int32;

  /** フォーマット */
  format: string;

  /** サイズ（バイト） */
  size_bytes: int32;
}

/**
 * 画像モデル
 */
model Image {
  /** 画像ID */
  image_id: UUID;

  /** アップローダーID */
  uploader_id: UUID;

  /** アップロード時間 */
  upload_time: Timestamp;

  /** ストレージパス */
  storage_path: string;

  /** メタデータ */
  metadata: ImageMetadata;
}

/**
 * 画像アップロードレスポンス
 */
model ImageUploadResponse {
  /** 画像ID */
  image_id: UUID;

  /** 画像URL */
  url: string;
}

/**
 * 画像特徴
 */
model ImageFeatures {
  /** 特徴リスト */
  features: string[];
}

/**
 * 画像マッチングリクエスト
 */
model ImageMatchRequest {
  /** マスター画像ID */
  master_image_id: UUID;

  /** ハンター画像ID */
  hunter_image_id: UUID;
}

/**
 * 画像マッチングレスポンス
 */
model ImageMatchResponse {
  /** 一致スコア */
  match_score: float32;

  /** マッチングポイント数 */
  matching_points: int32;
}

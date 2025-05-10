import "./common.tsp";

namespace SceneHunter.Models;

/**
 * プレイヤー登録リクエスト
 */
model RegisterPlayerRequest {
  /** プレイヤー名（1-12文字） */
  name: string;
}

/**
 * プレイヤー登録レスポンス
 */
model RegisterPlayerResponse {
  /** プレイヤーID */
  player_id: UUID;

  /** アクセストークン */
  access_token: string;

  /** リフレッシュトークン */
  refresh_token: string;

  /** トークンの有効期限（秒） */
  expires_in: int32;
}

/**
 * プレイヤーログインリクエスト
 */
model LoginPlayerRequest {
  /** プレイヤーID */
  player_id: UUID;
}

/**
 * プレイヤーログインレスポンス
 */
model LoginPlayerResponse {
  /** アクセストークン */
  access_token: string;

  /** リフレッシュトークン */
  refresh_token: string;

  /** トークンの有効期限（秒） */
  expires_in: int32;
}

/**
 * トークン更新リクエスト
 */
model RefreshTokenRequest {
  /** リフレッシュトークン */
  refresh_token: string;
}

/**
 * トークン更新レスポンス
 */
model RefreshTokenResponse {
  /** アクセストークン */
  access_token: string;

  /** リフレッシュトークン */
  refresh_token: string;

  /** トークンの有効期限（秒） */
  expires_in: int32;
}

/**
 * プレイヤー情報更新リクエスト
 */
model UpdatePlayerInfoRequest {
  /** プレイヤー名（1-12文字） */
  name: string;
}

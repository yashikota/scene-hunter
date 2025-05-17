/**
 * プレイヤーモデル
 */
export interface Player {
  /** プレイヤーID */
  player_id: string;

  /** プレイヤー名 */
  name: string;

  /** 作成日時（UNIXタイムスタンプ） */
  created_at: number;

  /** 総スコア */
  total_score: number;
}

/**
 * プレイヤー登録リクエスト
 */
export interface RegisterPlayerRequest {
  /** プレイヤー名（1-12文字） */
  name: string;
}

/**
 * プレイヤー登録レスポンス
 */
export interface RegisterPlayerResponse {
  /** プレイヤーID */
  player_id: string;

  /** アクセストークン */
  access_token: string;

  /** リフレッシュトークン */
  refresh_token: string;

  /** トークンの有効期限（秒） */
  expires_in: number;
}

/**
 * プレイヤーログインリクエスト
 */
export interface LoginPlayerRequest {
  /** プレイヤーID */
  player_id: string;
}

/**
 * プレイヤーログインレスポンス
 */
export interface LoginPlayerResponse {
  /** アクセストークン */
  access_token: string;

  /** リフレッシュトークン */
  refresh_token: string;

  /** トークンの有効期限（秒） */
  expires_in: number;
}

/**
 * トークン更新リクエスト
 */
export interface RefreshTokenRequest {
  /** リフレッシュトークン */
  refresh_token: string;
}

/**
 * トークン更新レスポンス
 */
export interface RefreshTokenResponse {
  /** アクセストークン */
  access_token: string;

  /** リフレッシュトークン */
  refresh_token: string;

  /** トークンの有効期限（秒） */
  expires_in: number;
}

/**
 * プレイヤー名更新リクエスト
 */
export interface UpdatePlayerNameRequest {
  /** プレイヤー名（1-12文字） */
  name: string;
}

/**
 * プレイヤースコア更新リクエスト
 */
export interface UpdatePlayerScoreRequest {
  /** 総スコア */
  total_score: number;
}

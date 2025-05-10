import "./common.tsp";
import "./player.tsp";

namespace SceneHunter.Models;

/**
 * ルームの状態
 */
enum RoomState {
  /** 待機中 */
  waiting,

  /** プレイ中 */
  playing,

  /** 終了 */
  finished,
}

/**
 * プレイヤーの役割
 */
enum PlayerRole {
  /** ゲームマスター */
  gamemaster,

  /** ハンター */
  hunter,
}

/**
 * ルーム内のプレイヤー情報
 */
model RoomPlayer {
  /** プレイヤーID */
  player_id: UUID;

  /** プレイヤー名 */
  name: string;

  /** 役割 */
  role: PlayerRole;

  /** スコア */
  score: float32;
}

/**
 * ルームモデル
 */
model Room {
  /** ルームID */
  room_id: UUID;

  /** ルームコード (6桁の数字) */
  room_code: string;

  /** 作成日時 */
  created_at: Timestamp;

  /** 作成者ID */
  creator_id: UUID;

  /** ゲームマスターID */
  gamemaster_id: UUID;

  /** ルームの状態 */
  state: RoomState;

  /** プレイヤーリスト */
  players: RoomPlayer[];

  /** 現在のラウンド */
  current_round: int32;

  /** 合計ラウンド数 */
  total_rounds: int32;
}

/**
 * ルーム作成リクエスト
 */
model CreateRoomRequest {
  /** 作成者ID */
  creator_id: UUID;

  /** ラウンド数 */
  rounds: int32;
}

/**
 * ルーム作成レスポンス
 */
model CreateRoomResponse {
  /** ルームID */
  room_id: UUID;

  /** ルームコード */
  room_code: string;
}

/**
 * ルーム参加リクエスト
 */
model JoinRoomRequest {
  /** プレイヤーID */
  player_id: UUID;

  /** ルームコード */
  room_code: string;
}

/**
 * ルーム退出リクエスト
 */
model LeaveRoomRequest {
  /** プレイヤーID */
  player_id: UUID;
}

/**
 * ゲームマスター設定リクエスト
 */
model SetGameMasterRequest {
  /** プレイヤーID */
  player_id: UUID;
}

/**
 * ルーム設定更新リクエスト
 */
model UpdateRoomSettingsRequest {
  /** ラウンド数 */
  rounds: int32;
}

/**
 * WebSocketイベントの基本型
 * すべてのイベント型の基底インターフェース
 */
export interface EventBase {
  /** イベントタイプ */
  event_type: string;

  /** イベント発生時刻 */
  timestamp: string;
}

/**
 * プレイヤー参加イベント
 */
export interface PlayerJoinedEvent extends EventBase {
  /** イベントタイプ (固定値: "room.player_joined") */
  event_type: "room.player_joined";

  /** プレイヤーID */
  player_id: string;

  /** プレイヤー名 */
  name: string;
}

/**
 * プレイヤー退出イベント
 */
export interface PlayerLeftEvent extends EventBase {
  /** イベントタイプ (固定値: "room.player_left") */
  event_type: "room.player_left";

  /** プレイヤーID */
  player_id: string;
}

/**
 * ゲームマスター変更イベント
 */
export interface GamemasterChangedEvent extends EventBase {
  /** イベントタイプ (固定値: "room.gamemaster_changed") */
  event_type: "room.gamemaster_changed";

  /** プレイヤーID */
  player_id: string;
}

/**
 * ラウンド開始イベント
 */
export interface RoundStartedEvent extends EventBase {
  /** イベントタイプ (固定値: "game.round_started") */
  event_type: "game.round_started";

  /** ラウンドID */
  round_id: string;

  /** 開始時刻 */
  start_time: string;
}

/**
 * ヒント公開イベント
 */
export interface HintRevealedEvent extends EventBase {
  /** イベントタイプ (固定値: "game.hint_revealed") */
  event_type: "game.hint_revealed";

  /** ヒント内容 */
  hint: string;

  /** ヒント番号 */
  hint_number: number;
}

/**
 * 写真提出イベント
 */
export interface PhotoSubmittedEvent extends EventBase {
  /** イベントタイプ (固定値: "game.photo_submitted") */
  event_type: "game.photo_submitted";

  /** プレイヤーID */
  player_id: string;

  /** 提出時刻 */
  submission_time: string;
}

/**
 * スコア更新イベント
 */
export interface ScoreUpdatedEvent extends EventBase {
  /** イベントタイプ (固定値: "game.score_updated") */
  event_type: "game.score_updated";

  /** プレイヤーID */
  player_id: string;

  /** スコア */
  score: number;
}

/**
 * プレイヤースコア
 */
export interface PlayerScore {
  /** プレイヤーID */
  player_id: string;

  /** プレイヤー名 */
  name: string;

  /** マッチスコア */
  match_score: number;

  /** 残り秒数 */
  remaining_seconds: number;

  /** 合計スコア */
  total_score: number;
}

/**
 * ラウンド終了イベント
 */
export interface RoundEndedEvent extends EventBase {
  /** イベントタイプ (固定値: "game.round_ended") */
  event_type: "game.round_ended";

  /** ラウンドID */
  round_id: string;

  /** 結果 */
  results: PlayerScore[];
}

/**
 * タイマー更新イベント
 */
export interface TimerUpdateEvent extends EventBase {
  /** イベントタイプ (固定値: "game.timer_update") */
  event_type: "game.timer_update";

  /** 残り秒数 */
  remaining_seconds: number;
}

/**
 * チャットメッセージイベント
 */
export interface ChatMessageEvent extends EventBase {
  /** イベントタイプ (固定値: "chat.message") */
  event_type: "chat.message";

  /** 送信者ID */
  sender?: string;

  /** メッセージ内容 */
  content: string;

  /** 受信者ID（個別メッセージの場合のみ） */
  recipient?: string;
}

/**
 * システムエラーイベント
 */
export interface SystemErrorEvent extends EventBase {
  /** イベントタイプ (固定値: "system.error") */
  event_type: "system.error";

  /** エラーメッセージ */
  content: string;
}

/**
 * ルーム接続イベント
 */
export interface RoomConnectedEvent extends EventBase {
  /** イベントタイプ (固定値: "room.connected") */
  event_type: "room.connected";

  /** プレイヤーID */
  player_id: string;

  /** メッセージ内容 */
  content: string;
}

/**
 * イベントの共用体型
 */
export type EventType =
  | PlayerJoinedEvent
  | PlayerLeftEvent
  | GamemasterChangedEvent
  | RoundStartedEvent
  | HintRevealedEvent
  | PhotoSubmittedEvent
  | ScoreUpdatedEvent
  | RoundEndedEvent
  | TimerUpdateEvent
  | ChatMessageEvent
  | SystemErrorEvent
  | RoomConnectedEvent;

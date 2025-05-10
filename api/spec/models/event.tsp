import "@typespec/http";
import "@typespec/openapi3";
import "./common.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace SceneHunter.Models;

/**
 * イベントの基本型
 */
model EventBase {
  /** イベントタイプ */
  event_type: string;

  /** イベント発生時刻 */
  timestamp: Timestamp;
}

/**
 * プレイヤー参加イベント
 */
model PlayerJoinedEvent extends EventBase {
  /** イベントタイプ (固定値: "room.player_joined") */
  event_type: "room.player_joined";

  /** プレイヤーID */
  player_id: UUID;

  /** プレイヤー名 */
  name: string;
}

/**
 * プレイヤー退出イベント
 */
model PlayerLeftEvent extends EventBase {
  /** イベントタイプ (固定値: "room.player_left") */
  event_type: "room.player_left";

  /** プレイヤーID */
  player_id: UUID;
}

/**
 * ゲームマスター変更イベント
 */
model GamemasterChangedEvent extends EventBase {
  /** イベントタイプ (固定値: "room.gamemaster_changed") */
  event_type: "room.gamemaster_changed";

  /** プレイヤーID */
  player_id: UUID;
}

/**
 * ラウンド開始イベント
 */
model RoundStartedEvent extends EventBase {
  /** イベントタイプ (固定値: "game.round_started") */
  event_type: "game.round_started";

  /** ラウンドID */
  round_id: UUID;

  /** 開始時刻 */
  start_time: Timestamp;
}

/**
 * ヒント公開イベント
 */
model HintRevealedEvent extends EventBase {
  /** イベントタイプ (固定値: "game.hint_revealed") */
  event_type: "game.hint_revealed";

  /** ヒント内容 */
  hint: string;

  /** ヒント番号 */
  hint_number: int32;
}

/**
 * 写真提出イベント
 */
model PhotoSubmittedEvent extends EventBase {
  /** イベントタイプ (固定値: "game.photo_submitted") */
  event_type: "game.photo_submitted";

  /** プレイヤーID */
  player_id: UUID;

  /** 提出時刻 */
  submission_time: Timestamp;
}

/**
 * スコア更新イベント
 */
model ScoreUpdatedEvent extends EventBase {
  /** イベントタイプ (固定値: "game.score_updated") */
  event_type: "game.score_updated";

  /** プレイヤーID */
  player_id: UUID;

  /** スコア */
  score: float32;
}

/**
 * ラウンド終了イベント
 */
model RoundEndedEvent extends EventBase {
  /** イベントタイプ (固定値: "game.round_ended") */
  event_type: "game.round_ended";

  /** ラウンドID */
  round_id: UUID;

  /** 結果 */
  results: PlayerScore[];
}

/**
 * タイマー更新イベント
 */
model TimerUpdateEvent extends EventBase {
  /** イベントタイプ (固定値: "game.timer_update") */
  event_type: "game.timer_update";

  /** 残り秒数 */
  remaining_seconds: int32;
}

/**
 * イベントの共用体型
 */
union EventType {
  PlayerJoinedEvent,
  PlayerLeftEvent,
  GamemasterChangedEvent,
  RoundStartedEvent,
  HintRevealedEvent,
  PhotoSubmittedEvent,
  ScoreUpdatedEvent,
  RoundEndedEvent,
  TimerUpdateEvent,
}

import "@typespec/http";
import "@typespec/openapi3";
import "../models/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace SceneHunter.Routes;

// イベントストリームのレスポンス
model EventStreamResponse {
  @header contentType: "text/event-stream";
  @body content: bytes;
}

// イベント取得レスポンス
model EventResponse {
  /** イベント */
  event: Models.EventType;
}

/**
 * イベントストリームのサンプルレスポンス
 *
 * ```
 * event: room.player_joined
 * data: {"event_type":"room.player_joined","timestamp":"2025-05-04T03:51:00Z","player_id":"123e4567-e89b-12d3-a456-426614174000","name":"Player1"}
 *
 * event: game.hint_revealed
 * data: {"event_type":"game.hint_revealed","timestamp":"2025-05-04T03:52:00Z","hint":"赤い建物の前","hint_number":1}
 *
 * event: game.timer_update
 * data: {"event_type":"game.timer_update","timestamp":"2025-05-04T03:52:30Z","remaining_seconds":120}
 * ```
 *
 * ## イベントペイロードのスキーマ定義
 *
 * ### 共通フィールド
 * すべてのイベントは以下の共通フィールドを持ちます：
 * - `event_type`: イベントタイプ（文字列）
 * - `timestamp`: イベント発生時刻（ISO 8601形式）
 *
 * ### イベント固有フィールド
 *
 * #### room.player_joined
 * ```json
 * {
 *   "event_type": "room.player_joined",
 *   "timestamp": "2025-05-04T03:51:00Z",
 *   "player_id": "123e4567-e89b-12d3-a456-426614174000",
 *   "name": "Player1"
 * }
 * ```
 *
 * #### room.player_left
 * ```json
 * {
 *   "event_type": "room.player_left",
 *   "timestamp": "2025-05-04T03:51:30Z",
 *   "player_id": "123e4567-e89b-12d3-a456-426614174000"
 * }
 * ```
 *
 * #### room.gamemaster_changed
 * ```json
 * {
 *   "event_type": "room.gamemaster_changed",
 *   "timestamp": "2025-05-04T03:52:00Z",
 *   "player_id": "123e4567-e89b-12d3-a456-426614174000"
 * }
 * ```
 *
 * #### game.round_started
 * ```json
 * {
 *   "event_type": "game.round_started",
 *   "timestamp": "2025-05-04T03:53:00Z",
 *   "round_id": "123e4567-e89b-12d3-a456-426614174001",
 *   "start_time": "2025-05-04T03:53:00Z"
 * }
 * ```
 *
 * #### game.hint_revealed
 * ```json
 * {
 *   "event_type": "game.hint_revealed",
 *   "timestamp": "2025-05-04T03:54:00Z",
 *   "hint": "赤い建物の前",
 *   "hint_number": 1
 * }
 * ```
 *
 * #### game.photo_submitted
 * ```json
 * {
 *   "event_type": "game.photo_submitted",
 *   "timestamp": "2025-05-04T03:55:00Z",
 *   "player_id": "123e4567-e89b-12d3-a456-426614174000",
 *   "submission_time": "2025-05-04T03:55:00Z"
 * }
 * ```
 *
 * #### game.score_updated
 * ```json
 * {
 *   "event_type": "game.score_updated",
 *   "timestamp": "2025-05-04T03:56:00Z",
 *   "player_id": "123e4567-e89b-12d3-a456-426614174000",
 *   "score": 85.5
 * }
 * ```
 *
 * #### game.round_ended
 * ```json
 * {
 *   "event_type": "game.round_ended",
 *   "timestamp": "2025-05-04T03:57:00Z",
 *   "round_id": "123e4567-e89b-12d3-a456-426614174001",
 *   "results": [
 *     {
 *       "player_id": "123e4567-e89b-12d3-a456-426614174000",
 *       "name": "Player1",
 *       "match_score": 85.5,
 *       "remaining_seconds": 45,
 *       "total_score": 123.5
 *     }
 *   ]
 * }
 * ```
 *
 * #### game.timer_update
 * ```json
 * {
 *   "event_type": "game.timer_update",
 *   "timestamp": "2025-05-04T03:58:00Z",
 *   "remaining_seconds": 120
 * }
 * ```
 */
@route("events")
@tag("Events")
interface Events {
  /**
   * イベントストリームに接続する
   *
   * このエンドポイントは、Server-Sent Events (SSE) プロトコルを使用して、
   * リアルタイムのイベント通知をクライアントに送信します。
   *
   * 送信されるイベントタイプ:
   * - room.player_joined: プレイヤーがルームに参加
   * - room.player_left: プレイヤーがルームから退出
   * - room.gamemaster_changed: ゲームマスターが変更
   * - game.round_started: ラウンドが開始
   * - game.hint_revealed: ヒントが公開
   * - game.photo_submitted: 写真が提出
   * - game.score_updated: スコアが更新
   * - game.round_ended: ラウンドが終了
   * - game.timer_update: タイマーが更新
   */
  @get
  @route("{room_id}")
  @summary("イベントストリームに接続する")
  @useAuth(BearerAuth)
  connectToEventStream(@path room_id: Models.UUID):
    | EventStreamResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * 最新のイベントを取得する
   */
  @get
  @route("{room_id}/latest")
  @summary("最新のイベントを取得する")
  @useAuth(BearerAuth)
  getLatestEvent(@path room_id: Models.UUID):
    | EventResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;
}

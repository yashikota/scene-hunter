export interface Player {
  player_id: string;
  name: string;
  role: 'gamemaster' | 'player';
  score_current_round_match: number; // 0.00-100.00 (画像一致スコア)
  points_current_round: number;      // score + time_bonus
  total_points_all_rounds: number;   // 全ラウンドの累計ポイント
  is_online: boolean; // ネットワーク状態 (簡略化のためオンライン状態のみ)
}

export interface Hint {
  text: string;
  is_revealed: boolean;
}

export interface HunterSubmission {
  player_internal_id: string;
  photo_id: string;       // ハンターが提出した写真のID (R2など)
  submitted_at: string;   // ISO timestamp
  image_match_score?: number; // AIによる一致率 (0.00 - 100.00)
  time_bonus?: number;       // 残り秒数ボーナス
  points_earned?: number;    // この提出で得たポイント
}

export interface Submission {
  player_id: string;
  photo_id: string;
  submission_time: string;
  remaining_seconds: number;
  match_score: number;
  total_score: number;
};

export interface RoundState {
  round_id: string;
  room_id: string;
  round_number: number;
  gamemaster_internal_id: string; // このラウンドのゲームマスター
  status: 'pending' | 'gamemaster_turn' | 'hunter_turn' | 'scoring' | 'completed' | 'cancelled';
  
  master_photo_id?: string;            // ゲームマスターが提出した写真のID
  master_photo_submitted_at?: string;
  
  ai_generated_hints: Hint[];         // AIが生成した全5つのヒント (テキストと開示状態)
  revealed_hints_count: number;       // 現在開示済みのヒント数
  
  turn_start_time?: string;            // 現在のターンの開始時刻
  turn_expires_at?: string;            // 現在のターンの終了予定時刻 (60秒)
  next_hint_reveal_time?: string;      // 次のヒント開示予定時刻

  hunter_submissions: { [player_internal_id: string]: HunterSubmission }; // ハンターの提出物

  // scoring_completed_at?: string;
  // results?: PlayerResult[]; // ラウンド結果サマリ
}

// export interface PlayerResult { // 必要に応じて
//   player_internal_id: string;
//   rank: number;
//   points_earned: number;
// }


export interface RoomState {
  code: string; // ルームID (6桁数字, 外部公開用)
  internal_room_id: string; // Durable Object ID (UUID)
  host_internal_id: string; // 現在のルームホスト (管理者、GMを兼ねることも)
  players: { [internal_id: string]: Player }; // key: internal_id
  
  game_status: 'waiting' | 'in_progress' | 'finished';
  current_round_number: number;
  total_rounds: number; // 1回以上
  
  round_states: { [round_id: string]: RoundState };
  
  // 設定項目
  settings: {
    turn_duration_seconds: number; // デフォルト60秒
    max_hints: number; // デフォルト5つ
    hint_interval_seconds: number; // デフォルト10秒
    min_players: number; // デフォルト3人
  };

  created_at: string;
  max_players: number; // 仕様にはないが、通常考慮する
}
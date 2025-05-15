export interface Player {
  player_id: string;
  name: string;
  role: 'gamemaster' | 'player';
  score: number;
}

export interface RoomState {
  id: string;
  code: string;
  host: string;
  players: Player[];
  status: 'waiting' | 'in_progress' | 'finished';
  createdAt: string;
  maxPlayers: number;
  rounds: number;
  roundStates?: Record<string, Round>;
}

export interface Submission {
  player_id: string;
  photo_id: string;
  submission_time: string;
  remaining_seconds: number;
  match_score: number;
  total_score: number;
};

export interface Round {
  round_id: string;
  room_id: string;
  round_number: number;
  start_time: string;
  end_time: string;
  state: 'waiting' | 'in_progress' | 'ended';
  master_photo_id: string;
  hints: string[];
  revealed_hints: number;
  submissions: Submission[];
};
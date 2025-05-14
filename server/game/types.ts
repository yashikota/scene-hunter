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
}
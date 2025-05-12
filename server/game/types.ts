export interface RoomState {
  id: string;
  code: string;
  host: string;
  players: string[];
  status: 'waiting' | 'in_progress' | 'finished';
  createdAt: string;
  maxPlayers: number;
  rounds: number;
}
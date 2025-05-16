// room-object.ts
import type { RoomState, RoundState, Player, Hint, HunterSubmission } from './types';
import type { DurableObjectState, DurableObjectStorage, R2Bucket } from '@cloudflare/workers-types';

// Import handlers
import { handleInit } from './handlers/initHandler';
import { handleRoomStart } from './handlers/roomStartHandler';
import { handleRoomInfo } from './handlers/roomInfoHandler';
import { handleJoin } from './handlers/joinHandler';
import { handleGamemaster } from './handlers/gamemasterHandler';
import { handleLeave } from './handlers/leaveHandler';
import { handleSettings } from './handlers/settingsHandler';
import { handleLeaderboard } from './handlers/leaderboardHandler';
import { handleTestRank } from './handlers/testRankHandler';
import { handleRoundPhoto } from './handlers/roundPhotoHandler';
import { handleRoundEnd } from './handlers/roundEndHandler';
import { handleRoundInfo } from './handlers/roundInfoHandler';
import { handleRoundsList } from './handlers/roundsListHandler';

const DEFAULT_TURN_DURATION = 60;
const DEFAULT_MAX_HINTS = 5;
const DEFAULT_HINT_INTERVAL = 10;
const DEFAULT_MIN_PLAYERS = 3;

// createRoom.tsから渡される/initのペイロードの型
interface InitPayload {
  code: string;
  total_rounds: number;
  admin_player_details: {
    player_id: string; // 外部IDとしてのplayer_id
    name: string;
  };
  host_internal_id: string; // createRoom.tsで生成された管理者の内部ID
}

export class RoomObject {
  state: DurableObjectState;
  storage: DurableObjectStorage;
  room: RoomState | undefined;
  env: {
    AI_IMAGE_SIMILARITY_SERVICE_URL?: string;
    AI_HINT_GENERATION_SERVICE_URL?: string; // AIヒント生成サービスURL
    R2_BUCKET?: R2Bucket;
    R2_PUBLIC_DOMAIN?: string;
  };

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.storage = state.storage;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      this.room = await this.storage.get<RoomState>('room');
    });
  }

  private async saveRoomState(): Promise<void> {
    if (this.room) {
      await this.storage.put('room', this.room);
    }
  }

  //private generateInternalId(): string {
  //  return crypto.randomUUID(); // UUID v4
  //}

  private generateUniquePlayerId(): string {
    // この関数は、管理者以外のプレイヤーが参加する際に、
    // プレイヤー自身がplayer_idを指定しない場合などに使われる想定。
    // 管理者のplayer_idはadmin_player_details.player_idから来る。
    let newPlayerId: string;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;
    const ID_LENGTH = 12;
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    do {
      newPlayerId = '';
      for (let i = 0; i < ID_LENGTH; i++) {
        newPlayerId += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
      }
      if (attempts++ > MAX_ATTEMPTS) {
        throw new Error("Failed to generate a unique player ID.");
      }
    } while (this.room && Object.values(this.room.players).some(p => p.player_id === newPlayerId));
    return newPlayerId;
  }

  // --- ゲーム進行・状態管理メソッド ---

async initializeNewRoom(
    roomCode: string,
    totalRounds: number,
    adminPlayerDetails: { player_id: string, name: string },
    hostInternalId: string // createRoom.ts から渡された管理者の内部ID
  ): Promise<Player> {
    // const adminInternalId = this.generateInternalId(); // ← 変更: 外部から渡されたIDを使用
    const adminInternalId = hostInternalId;

    // adminPlayerDetails から player_id と name を直接使用
    const adminPlayerId = adminPlayerDetails.player_id;
    const adminName = adminPlayerDetails.name;

    const adminPlayer: Player = {
      player_id: adminPlayerId, // 渡された player_id を使用
      name: adminName.substring(0, 20), // 名前も渡されたものを使用 (文字数制限は適宜調整)
      role: 'gamemaster',
      score_current_round_match: 0,
      points_current_round: 0,
      total_points_all_rounds: 0,
      is_online: true,
    };

    this.room = {
      code: roomCode, // ユーザー向けのルームコード
      internal_room_id: this.state.id.toString(), // Durable Object自身のID
      host_internal_id: adminInternalId, // 管理者の内部ID (playersオブジェクトのキーにもなる)
      players: { [adminInternalId]: adminPlayer },
      game_status: 'waiting',
      current_round_number: 0,
      total_rounds: totalRounds > 0 ? totalRounds : 1,
      round_states: {},
      settings: {
        turn_duration_seconds: DEFAULT_TURN_DURATION,
        max_hints: DEFAULT_MAX_HINTS,
        hint_interval_seconds: DEFAULT_HINT_INTERVAL,
        min_players: DEFAULT_MIN_PLAYERS,
      },
      created_at: new Date().toISOString(),
      max_players: 10,
    };
    await this.saveRoomState();
    return adminPlayer;
  }

  async startNextRound(gamemasterInternalId?: string): Promise<RoundState | null> {
    if (!this.room) return null;
    if (this.room.game_status === 'finished') {
        console.log("Game already finished.");
        return null;
    }
    if (Object.values(this.room.players).filter(p => p.is_online).length < this.room.settings.min_players) {
        console.log("Not enough players to start the round.");
        this.room.game_status = 'waiting'; // 必要な場合
        await this.saveRoomState();
        return null;
    }


    this.room.current_round_number++;
    const currentRoundNumber = this.room.current_round_number;
    const roundIdKey = `round_${currentRoundNumber}`;

    let gmId = gamemasterInternalId;
    if (!gmId) {
        // Find an admin or the host, or cycle GMs if logic dictates
        const admin = Object.values(this.room.players).find(p => p.role === 'gamemaster' && p.is_online);
        gmId = admin?.player_id || this.room.host_internal_id; // Fallback to host
    }
    if (!this.room.players[gmId] || !this.room.players[gmId].is_online) {
        console.error(`Selected Gamemaster ${gmId} is not valid or not online.`);
        // Attempt to find another GM or handle error
        const onlinePlayers = Object.values(this.room.players).filter(p => p.is_online);
        if (onlinePlayers.length > 0) {
            gmId = onlinePlayers[0].player_id; // Assign to first online player as a fallback
            console.warn(`Falling back to GM: ${gmId}`);
        } else {
            console.error("No online players available to be Gamemaster.");
            this.room.current_round_number--; // Revert increment
            this.room.game_status = 'waiting';
            await this.saveRoomState();
            return null;
        }
    }
    
    // Update player roles
    Object.values(this.room.players).forEach(p => {
        if (p.player_id === gmId) p.role = 'gamemaster';
        else p.role = 'player'; // Reset to player
        p.points_current_round = 0; // Reset round points
        p.score_current_round_match = 0;
    });


    const now = new Date();
    const turnEndTime = new Date(now.getTime() + this.room.settings.turn_duration_seconds * 1000);

    const newRound: RoundState = {
      round_id: roundIdKey,
      room_id: this.room.internal_room_id,
      round_number: currentRoundNumber,
      status: 'gamemaster_turn',
      gamemaster_internal_id: gmId,
      ai_generated_hints: [],
      revealed_hints_count: 0,
      turn_start_time: now.toISOString(),
      turn_expires_at: turnEndTime.toISOString(),
      hunter_submissions: {},
    };
    this.room.round_states[roundIdKey] = newRound;
    this.room.game_status = 'in_progress';

    await this.state.storage.setAlarm(turnEndTime.getTime());
    console.log(`Round ${currentRoundNumber} started. Gamemaster turn. Alarm set for ${turnEndTime.toISOString()}`);
    await this.saveRoomState();
    return newRound;
  }

  async processGamemasterPhoto(roundIdKey: string, photoKey: string, submittedByInternalId: string): Promise<boolean> {
    if (!this.room || !this.room.round_states[roundIdKey]) return false;
    const currentRound = this.room.round_states[roundIdKey];

    if (currentRound.status !== 'gamemaster_turn' || currentRound.gamemaster_internal_id !== submittedByInternalId) {
      console.error("Not GM's turn or invalid GM for photo submission.");
      return false;
    }

    currentRound.master_photo_id = photoKey;

    // AIによるヒント生成 (ここから)
    if (this.env.AI_HINT_GENERATION_SERVICE_URL && currentRound.master_photo_id) {
      const masterPhotoUrl = await this.getAccessibleImageUrl(currentRound.master_photo_id);
      if (masterPhotoUrl) {
        try {
          console.log(`Requesting hints from AI: ${this.env.AI_HINT_GENERATION_SERVICE_URL} for image ${masterPhotoUrl}`);
          const hintGenResponse = await fetch(this.env.AI_HINT_GENERATION_SERVICE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'YOUR_AI_HINT_SERVICE_API_KEY_IF_NEEDED' }, // 必要に応じてAPIキーを追加
            body: JSON.stringify({
              image_url: masterPhotoUrl,
              num_hints: this.room.settings.max_hints
            })
          });
          if (hintGenResponse.ok) {
            const hintData = await hintGenResponse.json() as { hints: string[] }; // AIサービスのレスポンス形式に合わせる
            currentRound.ai_generated_hints = hintData.hints.slice(0, this.room.settings.max_hints).map(text => ({ text, is_revealed: false }));
            console.log(`Generated ${currentRound.ai_generated_hints.length} hints.`);
          } else {
            const errorBody = await hintGenResponse.text();
            console.error(`Failed to generate hints from AI: ${hintGenResponse.status} ${hintGenResponse.statusText}. Body: ${errorBody}`);
            currentRound.ai_generated_hints = Array(this.room.settings.max_hints).fill(0).map((_,i)=>({text: `ヒント${i+1}の生成に失敗しました。`, is_revealed: false}));
          }
        } catch (e: any) {
          console.error("Error calling hint generation AI:", e.message);
          currentRound.ai_generated_hints = Array(this.room.settings.max_hints).fill(0).map((_,i)=>({text: `ヒント${i+1}の生成エラー。`, is_revealed: false}));
        }
      } else {
         console.error("Could not get master photo URL for hint generation.");
         currentRound.ai_generated_hints = Array(this.room.settings.max_hints).fill(0).map((_,i)=>({text: `ヒント${i+1} (画像URLエラー)`, is_revealed: false}));
      }
    } else {
        console.warn("AI_HINT_GENERATION_SERVICE_URL not configured. Using placeholder hints.");
        currentRound.ai_generated_hints = Array(this.room.settings.max_hints).fill(0).map((_, i) => ({ text: `ダミーヒント ${i + 1}`, is_revealed: false }));
    }
    // AIによるヒント生成 (ここまで)

    // ハンターターン開始
    currentRound.status = 'hunter_turn';
    const now = new Date();
    currentRound.turn_start_time = now.toISOString(); // ハンターターンの開始時刻を更新
    const turnEndTime = new Date(now.getTime() + this.room.settings.turn_duration_seconds * 1000);
    currentRound.turn_expires_at = turnEndTime.toISOString();
    currentRound.revealed_hints_count = 0; // リセット

    // 最初のヒントを即座に開示 (ルール: ヒントは最初に1つ)
    if (currentRound.ai_generated_hints.length > 0) {
        currentRound.ai_generated_hints[0].is_revealed = true;
        currentRound.revealed_hints_count = 1;
    }

    let nextAlarmTime = turnEndTime.getTime();
    if (currentRound.revealed_hints_count < this.room.settings.max_hints && currentRound.ai_generated_hints.length > currentRound.revealed_hints_count) {
        const nextHintTime = new Date(now.getTime() + this.room.settings.hint_interval_seconds * 1000).getTime();
        currentRound.next_hint_reveal_time = new Date(nextHintTime).toISOString();
        if (nextHintTime < nextAlarmTime) {
            nextAlarmTime = nextHintTime;
        }
    } else {
        currentRound.next_hint_reveal_time = undefined; // 全ヒント開示済みか、開示するヒントがない
    }
    
    await this.state.storage.setAlarm(nextAlarmTime);
    console.log(`Gamemaster photo submitted. Hunter turn started. Next alarm at ${new Date(nextAlarmTime).toISOString()}`);
    await this.saveRoomState();
    return true;
  }

  async processHunterPhoto(roundIdKey: string, photoKey: string, submittedByInternalId: string): Promise<boolean> {
    if (!this.room || !this.room.round_states[roundIdKey] || !this.room.players[submittedByInternalId]) return false;
    const currentRound = this.room.round_states[roundIdKey];
    const player = this.room.players[submittedByInternalId];

    if (currentRound.status !== 'hunter_turn' || player.role !== 'player') {
      console.error("Not hunter's turn or player is not a hunter.");
      return false;
    }
    if (currentRound.hunter_submissions[submittedByInternalId]) {
        console.warn(`Player ${submittedByInternalId} already submitted a photo for this round.`);
        // Optionally allow resubmission by overwriting, or disallow. Here, we disallow.
        return false;
    }

    currentRound.hunter_submissions[submittedByInternalId] = {
      player_internal_id: submittedByInternalId,
      photo_id: photoKey,
      submitted_at: new Date().toISOString(),
    };
    console.log(`Hunter ${player.player_id} (${submittedByInternalId}) submitted photo ${photoKey}`);
    await this.saveRoomState();
    return true;
  }


  async alarm() {
    if (!this.room || !this.room.current_round_number) return;

    const currentRoundIdKey = `round_${this.room.current_round_number}`;
    let currentRound = this.room.round_states[currentRoundIdKey];
    if (!currentRound) return;

    const now = new Date().getTime();
    let nextAlarmTime: number | undefined;

    console.log(`Alarm triggered for room ${this.room.code}, round ${currentRound.round_number}, status ${currentRound.status}`);

    // 1. ゲームマスターターン終了ロジック
    if (currentRound.status === 'gamemaster_turn' &&
        currentRound.turn_expires_at &&
        now >= new Date(currentRound.turn_expires_at).getTime()) {
      
      console.log(`Gamemaster turn expired for round ${currentRound.round_number}.`);
      if (!currentRound.master_photo_id) {
        console.log(`Gamemaster failed to submit photo in time. Cancelling round.`);
        // GMが写真未提出。ラウンドを中止するか、GM0点、他ハンターも0点として完了など。
        currentRound.status = 'cancelled'; // または 'completed' でスコアなし
        // TODO: プレイヤーに通知
        // 次のラウンドに進むかゲーム終了か
        if (this.room.current_round_number < this.room.total_rounds) {
            this.room.game_status = 'waiting'; // 次のラウンド開始を待つ
            console.log("GM time out. Waiting for next round to be started.");
        } else {
            this.room.game_status = 'finished';
            console.log("GM time out on last round. Game finished.");
        }
      } else {
        // 写真は提出済みだが、何らかの理由でアラームが発火した場合 (通常は起こりにくい)
        // processGamemasterPhoto でハンターターンに移行しているはず
        console.warn("GM turn expired but master photo was submitted. This case should be handled by photo submission logic.");
        // 念のためハンターターンへの移行処理を試みるか、現状維持で次のアラームを待つ。
        // ここでは何もしない、またはエラーログを残す。
      }
    }
    // 2. ハンターターン中のヒント開示ロジック
    else if (currentRound.status === 'hunter_turn' &&
        currentRound.next_hint_reveal_time &&
        now >= new Date(currentRound.next_hint_reveal_time).getTime()) {
      
      if (currentRound.revealed_hints_count < this.room.settings.max_hints &&
          currentRound.ai_generated_hints.length > currentRound.revealed_hints_count) {
        
        currentRound.ai_generated_hints[currentRound.revealed_hints_count].is_revealed = true;
        currentRound.revealed_hints_count++;
        console.log(`Revealed hint ${currentRound.revealed_hints_count}/${currentRound.ai_generated_hints.length} for round ${currentRound.round_number}`);

        if (currentRound.revealed_hints_count < this.room.settings.max_hints && 
            currentRound.ai_generated_hints.length > currentRound.revealed_hints_count) {
          currentRound.next_hint_reveal_time = new Date(new Date(currentRound.next_hint_reveal_time).getTime() + this.room.settings.hint_interval_seconds * 1000).toISOString();
        } else {
          currentRound.next_hint_reveal_time = undefined; // 全ヒント開示済み
          console.log("All hints revealed or max hints reached.");
        }
      } else {
         currentRound.next_hint_reveal_time = undefined; // 念のためクリア
      }
    }

    // 3. ハンターターン終了ロジック (ヒント開示より優先度は低いが、時刻が過ぎていれば処理)
    if (currentRound.status === 'hunter_turn' && // status が変わった可能性があるので再チェック
        currentRound.turn_expires_at &&
        now >= new Date(currentRound.turn_expires_at).getTime()) {
      
      console.log(`Hunter turn expired for round ${currentRound.round_number}. Proceeding to scoring.`);
      currentRound.status = 'scoring';
      currentRound.turn_expires_at = undefined;
      currentRound.next_hint_reveal_time = undefined;
      
      await this.processScoring(currentRoundIdKey); // スコアリング処理
      // processScoring の中で currentRound.status が 'completed' になる
      currentRound = this.room.round_states[currentRoundIdKey]; // 再取得

      if (this.room.current_round_number < this.room.total_rounds) {
        this.room.game_status = 'waiting'; // 次のラウンドの開始を待つ
        console.log(`Round ${currentRound.round_number} completed. Waiting for next round.`);
      } else {
        this.room.game_status = 'finished';
        console.log(`All rounds completed for room ${this.room.code}. Game finished.`);
      }
    }

    // 4. 次のアラーム設定
    // currentRoundの状態がalarm内で変化する可能性があるので、再評価
    currentRound = this.room.round_states[currentRoundIdKey]; 
    if (currentRound && (currentRound.status === 'gamemaster_turn' || currentRound.status === 'hunter_turn')) {
        if (currentRound.status === 'gamemaster_turn' && currentRound.turn_expires_at) {
            nextAlarmTime = new Date(currentRound.turn_expires_at).getTime();
        } else if (currentRound.status === 'hunter_turn') {
            const turnEnd = currentRound.turn_expires_at ? new Date(currentRound.turn_expires_at).getTime() : undefined;
            const nextHint = currentRound.next_hint_reveal_time ? new Date(currentRound.next_hint_reveal_time).getTime() : undefined;

            if (nextHint && turnEnd) nextAlarmTime = Math.min(nextHint, turnEnd);
            else if (turnEnd) nextAlarmTime = turnEnd;
            else if (nextHint) nextAlarmTime = nextHint;
        }
        
        if (nextAlarmTime && nextAlarmTime > now) {
            await this.state.storage.setAlarm(nextAlarmTime);
            console.log(`Alarm rescheduled for ${new Date(nextAlarmTime).toISOString()}`);
        } else {
            await this.state.storage.deleteAlarm();
            console.log("No valid future event for alarm, alarm deleted or handled by turn end.");
        }
    } else {
        await this.state.storage.deleteAlarm(); // ラウンド完了時などはアラーム不要
        console.log(`Round is ${currentRound?.status}, no active turn alarm needed.`);
    }

    await this.saveRoomState();
  }

  private async getAccessibleImageUrl(photoKey: string): Promise<string | null> {
    if (!photoKey) return null;
    if (this.env.R2_PUBLIC_DOMAIN) {
      const domain = this.env.R2_PUBLIC_DOMAIN.replace(/\/$/, '');
      return `https://${domain}/${photoKey}`;
    }
    // R2 署名付きURL生成ロジック (未実装、要SDKなど)
    if (this.env.R2_BUCKET) {
      console.warn("R2_BUCKET is defined, but signed URL generation is not implemented. Consider using R2_PUBLIC_DOMAIN or implementing signed URLs.");
      // For example, using a hypothetical generateSignedR2Url function:
      // try {
      //   const { sign } = await import('@tsndr/cloudflare-worker-r2-signed-url'); // Example library
      //   const signedUrl = await sign(`r2://${this.env.R2_BUCKET.bucketName}/${photoKey}`, { accessKeyId: '...', secretAccessKey: '...', region: 'auto',  expiresIn: 300 });
      //   return signedUrl;
      // } catch (e) {
      //    console.error("Error generating signed URL", e);
      //    return null
      // }
      return null; // 実装するまで null を返す
    }
    console.error("Cannot determine image URL: R2_PUBLIC_DOMAIN or R2_BUCKET with signing logic required.");
    return null;
  }

  private async processScoring(roundIdKey: string): Promise<void> {
    await this.state.blockConcurrencyWhile(async () => {
      if (!this.room) {
        console.error("Scoring failed: Room state is not loaded.");
        return;
      }
      const round = this.room.round_states[roundIdKey];
      if (!round) {
        console.error(`Scoring failed: Round ${roundIdKey} not found.`);
        return;
      }
      if (round.status === 'cancelled') {
        console.log(`Round ${round.round_number} was cancelled. Skipping scoring.`);
        round.status = 'completed'; // キャンセルも完了の一種として扱う
        // 参加者全員0ポイント処理
        Object.values(this.room.players).forEach(player => {
            if (player.role === 'player' || player.role === 'gamemaster') { // GMも含む場合
                player.points_current_round = 0;
                player.score_current_round_match = 0;
            }
        });
        await this.saveRoomState();
        return;
      }

      if (!round.master_photo_id) {
        console.error(`Scoring failed: Master photo for round ${round.round_number} is missing.`);
        round.status = 'completed'; // スコアリング不能
         Object.values(this.room.players).forEach(player => {
            if (player.role === 'player') {
                player.points_current_round = 0;
                player.score_current_round_match = 0;
            }
        });
        await this.saveRoomState();
        return;
      }

      const masterPhotoUrl = await this.getAccessibleImageUrl(round.master_photo_id);
      if (!masterPhotoUrl) {
        console.error(`Failed to get URL for master photo ${round.master_photo_id}. Aborting scoring for round ${round.round_number}.`);
        round.status = 'completed'; // or 'scoring_error'
        Object.values(this.room.players).forEach(player => {
            if (player.role === 'player') {
                player.points_current_round = 0;
                player.score_current_round_match = 0;
            }
        });
        await this.saveRoomState();
        return;
      }

      console.log(`Processing scores for round ${round.round_number}. Master photo: ${masterPhotoUrl}`);

      for (const playerInternalId in this.room.players) {
        const player = this.room.players[playerInternalId];
        if (player.role !== 'player') continue; // ハンターのみ採点

        const submission = round.hunter_submissions[playerInternalId];
        let matchScore = 0;
        let timeBonus = 0;

        if (!player.is_online && !submission) {
            console.log(`Player ${player.player_id} (${playerInternalId}) was offline and did not submit. Points: 0`);
            // is_online は最終提出時ではなく、スコアリング開始時の状態で判断することも検討
            // ネットワーク切断の定義による
        } else if (!submission) {
            console.log(`Player ${player.player_id} (${playerInternalId}) did not submit a photo. Points: 0`);
        } else {
            const hunterPhotoUrl = await this.getAccessibleImageUrl(submission.photo_id);
            if (!hunterPhotoUrl) {
              console.error(`Failed to get URL for hunter photo ${submission.photo_id} by player ${player.player_id}. Assigning 0 score.`);
              matchScore = 0;
            } else {
              if (!this.env.AI_IMAGE_SIMILARITY_SERVICE_URL) {
                console.warn('AI_IMAGE_SIMILARITY_SERVICE_URL is not configured. Assigning random scores for development.');
                matchScore = parseFloat((Math.random() * 70 + 30).toFixed(2)); // 30-100 for fallback
              } else {
                try {
                  const compareApiUrl = `${this.env.AI_IMAGE_SIMILARITY_SERVICE_URL.replace(/\/$/, '')}/compare`;
                  console.log(`Calling AI: POST ${compareApiUrl} for player ${player.player_id}`);
                  const response = await fetch(compareApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'YOUR_AI_SIMILARITY_API_KEY' }, // 必要に応じてAPIキー
                    body: JSON.stringify({ image1_url: masterPhotoUrl, image2_url: hunterPhotoUrl }),
                  });

                  if (!response.ok) {
                    const errorBody = await response.text();
                    console.error(`AI service call failed for player ${player.player_id}: ${response.status}. Body: ${errorBody}`);
                    matchScore = 0;
                  } else {
                    const result = await response.json() as any; // AIレスポンス型に合わせて
                    if (result && typeof result.similarity_score === 'number') {
                      matchScore = parseFloat(Math.max(0, Math.min(100, result.similarity_score)).toFixed(2));
                    } else {
                      console.error(`Invalid AI response for player ${player.player_id}: ${JSON.stringify(result)}`);
                      matchScore = 0;
                    }
                  }
                } catch (e:any) {
                  console.error(`Error calling AI service for player ${player.player_id}:`, e.message);
                  matchScore = 0;
                }
              }
            }
            submission.image_match_score = matchScore;

            // 時間ボーナス計算
            const hunterTurnStartTime = new Date(round.turn_start_time!).getTime(); // GM写真提出後、ハンターターン開始時
            const submissionTime = new Date(submission.submitted_at).getTime();
            const timeTakenSeconds = Math.max(0, (submissionTime - hunterTurnStartTime) / 1000);
            timeBonus = Math.max(0, this.room.settings.turn_duration_seconds - Math.floor(timeTakenSeconds));
            submission.time_bonus = timeBonus;
        }
        
        const pointsEarned = parseFloat((matchScore + timeBonus).toFixed(2));
        if(submission) submission.points_earned = pointsEarned;

        player.score_current_round_match = matchScore;
        player.points_current_round = pointsEarned;
        player.total_points_all_rounds = parseFloat(((player.total_points_all_rounds || 0) + pointsEarned).toFixed(2));
        
        console.log(`Player ${player.player_id} - Match: ${matchScore}, Bonus: ${timeBonus}, Round Pts: ${pointsEarned}, Total Pts: ${player.total_points_all_rounds}`);
      }

      round.status = 'completed';
      console.log(`Scoring fully completed for round ${round.round_number}`);
      await this.saveRoomState();
    });
  }


    async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    //const requestContext = { room: this.room, storage: this.storage, env: this.env, state: this.state, object: this };

    if (pathname === '/init' && request.method === 'POST') {
      try {
        if (this.room) {
          return new Response(JSON.stringify({
            success: false,
            message: "Room already initialized",
            code: this.room.code
          }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const data = await request.json() as InitPayload; // 型を修正

        const roomCode = data.code;
        const totalRounds = data.total_rounds;
        const adminDetails = data.admin_player_details;
        const hostInternalId = data.host_internal_id; // host_internal_id を受け取る

        if (!roomCode || !adminDetails || !adminDetails.player_id || typeof adminDetails.name === 'undefined' || !hostInternalId) {
          return new Response(JSON.stringify({
            success: false,
            message: "Missing required fields in init payload (code, admin_player_details with player_id and name, host_internal_id)"
          }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const adminPlayer = await this.initializeNewRoom(roomCode, totalRounds, adminDetails, hostInternalId);
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: "Room initialized successfully.",
          code: (this.room as unknown as RoomState)?.code, // 初期化後のルームコードを返す
          internal_room_id: ((this.room as unknown) as RoomState)?.internal_room_id,
          admin_player_id: adminPlayer.player_id,
          host_internal_id: ((this.room as unknown) as RoomState)?.host_internal_id
        }), { headers: { 'Content-Type': 'application/json' }});
      } catch (e: any) {
        console.error("Error during /init:", e);
        return new Response(JSON.stringify({
          success: false,
          message: e.message || "Internal server error during initialization."
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }
   // ルームが存在しない場合は以降の操作を許可しない (init以外)
    if (!this.room) {
        return new Response('Room not initialized or not found.', { status: 404 });
    }

    // /rooms/:roomId/start
    //curl -X POST http://localhost:4282/rooms/<room_id>/start -H "Authorization: Bearer test" -H "Content-Type: application/json" -d "{\"gamemaster_id\": \"host_name\"}"
    const roomStartMatch = pathname.match(/^\/rooms\/([^/]+)\/start$/);
    if (roomStartMatch && request.method === 'POST') {
      const roomId = roomStartMatch[1];
      return handleRoomStart(this.storage, request, roomId);
    }

    // /rounds/:roundId/photo
    //curl -X POST http://localhost:4282/rooms/<room_id>/rounds/<round_id>/photo -H "Authorization: Bearer testtoken" -F "player_id=tom" -F "photo=@path/to/photo.jpg"
    const roundPhotoMatch = pathname.match(/^\/rounds\/([^/]+)\/photo$/);
    if (roundPhotoMatch && request.method === 'POST') {
      const roundId = roundPhotoMatch[1];
      return handleRoundPhoto(this.storage, request, roundId);
    }

    // /rounds/:roundId/end
    //curl -X POST http://localhost:4282/rooms/<room_id>/rounds/<round_id>/end -H "Authorization: Bearer test"
    const roundEndMatch = pathname.match(/^\/rounds\/([^/]+)\/end$/);
    if (roundEndMatch && request.method === 'POST') {
      const roundId = roundEndMatch[1];
      return handleRoundEnd({ room: this.room, storage: this.storage }, request, roundId);
    }

    // /rounds/:roundId (GET)
    //curl -X GET http://localhost:4282/rooms/<room_id>/rounds/<round_id> -H "Authorization: Bearer test"
    const roundInfoMatch = pathname.match(/^\/rounds\/([^/]+)$/);
    if (roundInfoMatch && request.method === 'GET') {
      const roundId = roundInfoMatch[1];
      return handleRoundInfo(this.storage, request, roundId);
    }
    
    // /info (GET)
    //curl http://localhost:4282/rooms/<room_id> -H "Authorization: Bearer testtoken"
    if (pathname.match(/^\/rooms\/[^/]+$/) && request.method === 'GET') {
      // パスからroom_idを抽出し、internal_room_idと一致する場合のみ情報を返す
      const match = pathname.match(/^\/rooms\/([^/]+)$/);
      if (match && match[1] === this.room.internal_room_id) {
        return handleRoomInfo(this.storage, request);
      } else {
        return new Response('Room not found', { status: 404 });
      }
    }
    
    // /join (POST)
    //curl -X POST http://localhost:4282/rooms/<room_id>/join -H "Content-Type: application/json" -H "Authorization: Bearer testtoken" -d "{\"player_id\": \"tom\", \"room_code\": \"594623\"}"
    if (pathname === '/join' && request.method === 'POST') {
      return handleJoin(this.storage, request);
    }

    // /gamemaster (PUT)
    //curl -X PUT http://localhost:4282/rooms/<room_id>/gamemaster -H "Authorization: Bearer testtoken" -H "Content-Type: application/json" -d "{\"player_id\": \"tom\"}"
    if (pathname === '/gamemaster' && request.method === 'PUT') {
      return handleGamemaster(this.storage, request);
    }

    // /leave (POST)
    //curl -X POST http://localhost:4282/rooms/<room_id>/leave -H "Authorization: Bearer testtoken" -H "Content-Type: application/json" -d "{\"player_id\": \"tom\"}"
    if (pathname === '/leave' && request.method === 'POST') {
      return handleLeave(this.storage, request);
    }

    // /settings (PUT)
    //curl -X PUT http://localhost:4282/rooms/<room_id>/settings -H "Authorization: Bearer testtoken" -H "Content-Type: application/json" -d "{\"rounds\": 2}"
    if (pathname === '/settings' && request.method === 'PUT') {
      return handleSettings(this.storage, request);
    }

    // /leaderboard (GET)
    //curl -X GET http://localhost:4282/rooms/<room_id>/leaderboard -H "Authorization: Bearer testtoken"
    if (pathname === '/leaderboard' && request.method === 'GET') {
      return handleLeaderboard(this.storage, request);
    }
    
    // /test-rank (POST)
    //curl -X POST http://localhost:4282/rooms/<room_id>/test-rank -H "Authorization: Bearer testtoken"
    if (pathname === '/test-rank' && request.method === 'POST') {
      return handleTestRank(this.storage, request);
    }

    // /rounds (GET)
    //curl -X GET http://localhost:4282/rooms/<room_id>/rounds -H "Authorization: Bearer test"
    if (pathname === '/rounds' && request.method === 'GET') {
        return handleRoundsList(this.storage, request);
    }

    return new Response('Not found', { status: 404 });
  }
}
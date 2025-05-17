import type { Player } from "../models/player";
import { PlayerRepository } from "../repositories/player-repository";

/**
 * プレイヤーサービス
 * プレイヤー情報の管理機能を提供するクラス
 */
export class PlayerService {
  private playerRepo: PlayerRepository;

  /**
   * コンストラクタ
   * @param db D1データベース
   */
  constructor(db: D1Database) {
    this.playerRepo = new PlayerRepository(db);
  }

  /**
   * プレイヤーIDでプレイヤーを取得する
   * @param playerId プレイヤーID
   * @returns プレイヤー情報
   */
  async getPlayerById(playerId: string): Promise<Player | null> {
    return this.playerRepo.getPlayerById(playerId);
  }

  /**
   * プレイヤー名を更新する
   * @param playerId プレイヤーID
   * @param name 新しいプレイヤー名
   * @returns 更新されたプレイヤー情報
   */
  async updatePlayerName(
    playerId: string,
    name: string,
  ): Promise<Player | null> {
    // 名前のバリデーション
    if (!name || name.length > 12) {
      throw new Error("プレイヤー名は1-12文字である必要があります");
    }

    return this.playerRepo.updatePlayerName(playerId, name);
  }

  /**
   * プレイヤーの総スコアを更新する
   * @param playerId プレイヤーID
   * @param totalScore 新しい総スコア
   * @returns 更新されたプレイヤー情報
   */
  async updatePlayerScore(
    playerId: string,
    totalScore: number,
  ): Promise<Player | null> {
    // スコアのバリデーション
    if (typeof totalScore !== "number" || totalScore < 0) {
      throw new Error("スコアは0以上の数値である必要があります");
    }

    return this.playerRepo.updatePlayerScore(playerId, totalScore);
  }
}

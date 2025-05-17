import type { Player } from "../models/player";

/**
 * プレイヤーリポジトリ
 * D1データベースを使用してプレイヤー情報を管理するクラス
 */
export class PlayerRepository {
  private db: D1Database;

  /**
   * コンストラクタ
   * @param db D1データベース
   */
  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * プレイヤーを作成する
   * @param player プレイヤー情報
   * @returns 作成されたプレイヤー
   */
  async createPlayer(player: Player): Promise<Player> {
    await this.db
      .prepare(
        "INSERT INTO players (player_id, name, created_at, total_score) VALUES (?, ?, ?, ?)",
      )
      .bind(
        player.player_id,
        player.name,
        player.created_at,
        player.total_score,
      )
      .run();

    return player;
  }

  /**
   * プレイヤーIDでプレイヤーを取得する
   * @param playerId プレイヤーID
   * @returns プレイヤー情報（存在しない場合はnull）
   */
  async getPlayerById(playerId: string): Promise<Player | null> {
    const result = await this.db
      .prepare("SELECT * FROM players WHERE player_id = ?")
      .bind(playerId)
      .first<Player>();

    return result || null;
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
    await this.db
      .prepare("UPDATE players SET name = ? WHERE player_id = ?")
      .bind(name, playerId)
      .run();

    return this.getPlayerById(playerId);
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
    await this.db
      .prepare("UPDATE players SET total_score = ? WHERE player_id = ?")
      .bind(totalScore, playerId)
      .run();

    return this.getPlayerById(playerId);
  }
}

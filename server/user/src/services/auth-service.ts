import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type {
  LoginPlayerResponse,
  RefreshTokenResponse,
  RegisterPlayerResponse,
} from "../models/player";
import { PlayerRepository } from "../repositories/player-repository";

/**
 * 認証サービス
 * Supabase Authを使用した認証機能を提供するクラス
 */
export class AuthService {
  private supabase: SupabaseClient;
  private playerRepo: PlayerRepository;

  /**
   * コンストラクタ
   * @param env 環境変数
   */
  constructor(env: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
    USER_DB: D1Database;
  }) {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    this.playerRepo = new PlayerRepository(env.USER_DB);
  }

  /**
   * プレイヤーを登録する
   * @param name プレイヤー名
   * @returns 登録結果
   */
  async registerPlayer(name: string): Promise<RegisterPlayerResponse> {
    // 匿名認証を使用してユーザーを作成
    const { data: authData, error: authError } =
      await this.supabase.auth.signInAnonymously({
        options: {
          data: {
            is_anonymous: true,
            player_name: name,
          },
        },
      });

    if (authError) throw new Error(`認証エラー: ${authError.message}`);
    if (!authData.user || !authData.session)
      throw new Error("ユーザーまたはセッションの作成に失敗しました");

    // 3. D1にプレイヤー情報保存
    const player = await this.playerRepo.createPlayer({
      player_id: authData.user.id,
      name,
      created_at: Math.floor(Date.now() / 1000),
      total_score: 0,
    });

    // 4. トークン情報を返却
    return {
      player_id: player.player_id,
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in || 3600,
    };
  }

  /**
   * プレイヤーとしてログインする
   * @param playerId プレイヤーID
   * @returns ログイン結果
   */
  async loginPlayer(playerId: string): Promise<LoginPlayerResponse> {
    // 1. プレイヤーの存在確認
    const player = await this.playerRepo.getPlayerById(playerId);
    if (!player) throw new Error("プレイヤーが見つかりません");

    // 2. Supabaseでユーザー情報を取得
    const { data, error } =
      await this.supabase.auth.admin.getUserById(playerId);
    if (error || !data) throw new Error("ユーザーが見つかりません");

    // 3. 新しいセッションを作成
    const { data: sessionData, error: sessionError } =
      await this.supabase.auth.signInWithPassword({
        email: data.user.email || `${playerId}@example.com`,
        password: playerId,
      });

    if (sessionError)
      throw new Error(`セッション作成エラー: ${sessionError.message}`);
    if (!sessionData.session) throw new Error("セッションの作成に失敗しました");

    // 4. トークン情報を返却
    return {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in || 3600,
    };
  }

  /**
   * トークンを更新する
   * @param refreshToken リフレッシュトークン
   * @returns 更新結果
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    // Supabaseでトークン更新
    const { data, error } = await this.supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) throw new Error(`トークン更新エラー: ${error.message}`);
    if (!data.session) throw new Error("セッションの更新に失敗しました");

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in || 3600,
    };
  }

  /**
   * トークンを検証する
   * @param token アクセストークン
   * @returns ユーザー情報
   */
  async verifyToken(
    token: string,
  ): Promise<{ id: string; email?: string; metadata?: any }> {
    const { data, error } = await this.supabase.auth.getUser(token);

    if (error) throw new Error(`トークン検証エラー: ${error.message}`);
    if (!data.user) throw new Error("無効なトークンです");

    return {
      id: data.user.id,
      email: data.user.email || undefined,
      metadata: data.user.user_metadata,
    };
  }
}

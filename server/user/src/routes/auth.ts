import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { ApiError } from "../middlewares/error-handler";
import { AuthService } from "../services/auth-service";
import type { Env } from "../types/cloudflare";

// バリデーションスキーマ
const registerPlayerSchema = z.object({
  name: z.string().min(1).max(12).describe("プレイヤー名（1-12文字）"),
});

const loginPlayerSchema = z.object({
  player_id: z.string().uuid().describe("プレイヤーID"),
});

const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1).describe("リフレッシュトークン"),
});

// 認証ルート
const auth = new Hono<{ Bindings: Env }>();

/**
 * プレイヤーを登録する
 * POST /auth/register
 */
auth.post("/register", zValidator("json", registerPlayerSchema), async (c) => {
  const { name } = c.req.valid("json") as { name: string };
  const authService = new AuthService(c.env);

  try {
    const result = await authService.registerPlayer(name);
    return c.json(result);
  } catch (error) {
    if (error instanceof Error) {
      throw ApiError.badRequest(error.message);
    }
    throw ApiError.internal("プレイヤー登録中にエラーが発生しました");
  }
});

/**
 * プレイヤーとしてログインする
 * POST /auth/login
 */
auth.post("/login", zValidator("json", loginPlayerSchema), async (c) => {
  const { player_id } = c.req.valid("json") as { player_id: string };
  const authService = new AuthService(c.env);

  try {
    const result = await authService.loginPlayer(player_id);
    return c.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("見つかりません")) {
        throw ApiError.notFound(error.message);
      }
      throw ApiError.unauthorized(error.message);
    }
    throw ApiError.internal("ログイン中にエラーが発生しました");
  }
});

/**
 * トークンを更新する
 * POST /auth/refresh
 */
auth.post("/refresh", zValidator("json", refreshTokenSchema), async (c) => {
  const { refresh_token } = c.req.valid("json") as { refresh_token: string };
  const authService = new AuthService(c.env);

  try {
    const result = await authService.refreshToken(refresh_token);
    return c.json(result);
  } catch (error) {
    if (error instanceof Error) {
      throw ApiError.unauthorized(error.message);
    }
    throw ApiError.internal("トークン更新中にエラーが発生しました");
  }
});

export { auth as authRoutes };

import { Context, type MiddlewareHandler, Next } from "hono";
import { AuthService } from "../services/auth-service";
import type { Env } from "../types/cloudflare";

/**
 * 認証ミドルウェア
 * JWTトークンを検証し、ユーザー情報をコンテキストに設定する
 * @returns ミドルウェア関数
 */
export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next,
) => {
  const authService = new AuthService(c.env);
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      {
        code: "unauthorized",
        message: "認証が必要です",
      },
      401,
    );
  }

  const token = authHeader.split(" ")[1];

  try {
    // トークン検証
    const user = await authService.verifyToken(token);

    // ユーザー情報をコンテキストに設定
    c.set("user", user);

    await next();
  } catch (error) {
    return c.json(
      {
        code: "unauthorized",
        message: error instanceof Error ? error.message : "無効なトークンです",
      },
      401,
    );
  }
};

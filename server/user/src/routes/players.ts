import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware } from "../middlewares/auth";
import { ApiError } from "../middlewares/error-handler";
import { PlayerService } from "../services/player-service";
import type { Env } from "../types/cloudflare";

// バリデーションスキーマ
const updatePlayerNameSchema = z.object({
  name: z.string().min(1).max(12).describe("プレイヤー名（1-12文字）"),
});

const updatePlayerScoreSchema = z.object({
  total_score: z.number().min(0).describe("総スコア"),
});

// プレイヤールート
const players = new Hono<{ Bindings: Env }>();

// 認証ミドルウェアを適用
players.use("*", authMiddleware);

/**
 * プレイヤー情報を取得する
 * GET /players/:player_id
 */
players.get("/:player_id", async (c) => {
  const playerId = c.req.param("player_id");

  // playerId が undefined の場合はエラーを投げる
  if (!playerId) {
    throw ApiError.badRequest("プレイヤーIDが必要です");
  }

  const playerService = new PlayerService(c.env.USER_DB);

  const player = await playerService.getPlayerById(playerId);

  if (!player) {
    throw ApiError.notFound("プレイヤーが見つかりません");
  }

  return c.json(player);
});

/**
 * プレイヤー名を更新する
 * PUT /players/:player_id
 */
players.put(
  "/:player_id",
  zValidator("json", updatePlayerNameSchema),
  async (c) => {
    const playerId = c.req.param("player_id");
    const { name } = c.req.valid("json") as { name: string };
    const user = c.get("user");

    // playerId が undefined の場合はエラーを投げる
    if (!playerId) {
      throw ApiError.badRequest("プレイヤーIDが必要です");
    }

    // 権限チェック
    if (user.id !== playerId) {
      throw ApiError.forbidden("権限がありません");
    }

    const playerService = new PlayerService(c.env.USER_DB);

    try {
      const player = await playerService.updatePlayerName(playerId, name);

      if (!player) {
        throw ApiError.notFound("プレイヤーが見つかりません");
      }

      return c.json(player);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (error instanceof Error) {
        throw ApiError.badRequest(error.message);
      }
      throw ApiError.internal("プレイヤー名更新中にエラーが発生しました");
    }
  },
);

/**
 * プレイヤーの総スコアを更新する
 * PUT /players/:player_id/score
 */
players.put(
  "/:player_id/score",
  zValidator("json", updatePlayerScoreSchema),
  async (c) => {
    const playerId = c.req.param("player_id");
    const { total_score } = c.req.valid("json") as { total_score: number };

    const playerService = new PlayerService(c.env.USER_DB);

    try {
      // playerId が undefined の場合はエラーを投げる
      if (!playerId) {
        throw ApiError.badRequest("プレイヤーIDが必要です");
      }

      const player = await playerService.updatePlayerScore(
        playerId,
        total_score,
      );

      if (!player) {
        throw ApiError.notFound("プレイヤーが見つかりません");
      }

      return c.json(player);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (error instanceof Error) {
        throw ApiError.badRequest(error.message);
      }
      throw ApiError.internal("スコア更新中にエラーが発生しました");
    }
  },
);

export { players as playerRoutes };

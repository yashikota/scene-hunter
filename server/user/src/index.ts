import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { errorHandler } from "./middlewares/error-handler";
import { authRoutes } from "./routes/auth";
import { playerRoutes } from "./routes/players";
import type { Env } from "./types/cloudflare";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use("*", cors());
app.use("*", errorHandler());

// ルートの設定
app.route("/auth", authRoutes);
app.route("/players", playerRoutes);

// ヘルスチェック
app.get("/health", (c) => {
  return c.json({
    status: "ok",
  });
});

export default app;

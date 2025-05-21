import { Hono, Context, Next } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { authMiddleware } from '../../middlewares/auth'; // Adjust path as necessary
import { errorHandler } from "./middlewares/error-handler";
import { authRoutes } from "./routes/auth";
import { playerRoutes } from "./routes/players";
import type { Env } from "./types/cloudflare.d"; // Ensure .d is included if that's the actual filename

// Define a type for the context variables based on existing Hono declarations
// from ./types/cloudflare.d.ts and add supabase
interface AppVariables {
  supabase?: SupabaseClient;
  user: { // This structure is from ./types/cloudflare.d.ts
    id: string;
    email?: string;
    app_metadata?: {
      roles?: string[];
    };
  };
  server?: { // This structure is from ./types/cloudflare.d.ts
    isGameServer: boolean;
  };
}

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// General middlewares
app.use("*", logger());
app.use("*", cors());

// Middleware to initialize Supabase client
// This should run for all paths that might need Supabase.
// It's placed before errorHandler so errors during Supabase init can be caught.
app.use('*', async (c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) => {
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_KEY) { // Using SUPABASE_KEY as per Env definition
    console.error('Supabase URL or Key not set in environment.');
    // For /players routes, Supabase is critical.
    // For /auth routes, it might also be needed for user creation/management.
    // For /health, it's not.
    // We'll let it proceed and specific routes can fail if Supabase isn't available.
    console.warn('Supabase client not initialized due to missing environment variables.');
  } else {
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY); // Using SUPABASE_KEY
    c.set('supabase', supabase);
  }
  await next();
});

// Error handler should ideally be after Supabase/Auth middlewares if they might throw errors
// that the handler is meant to catch. Or, it can be first if it's a very generic handler.
// Given its name, let's keep it after Supabase/Auth.
// app.use("*", errorHandler()); // Moved to be after auth-requiring routes or applied selectively

// ルートの設定
app.route("/auth", authRoutes); // Auth routes (login/signup) should NOT use JWT verification middleware

// Apply JWT authentication middleware to /players routes
// The Hono type for `playerRoutes` should be compatible with `Context<{ Bindings: Env; Variables: AppVariables }>`
// and expect `user` and `supabase` in context.
app.use("/players/*", authMiddleware); // Protect all sub-routes of /players
app.route("/players", playerRoutes);

// Apply error handler last for routes that passed auth or didn't require it
app.use("*", errorHandler());

// ヘルスチェック
app.get("/health", (c) => {
  return c.json({
    status: "ok",
  });
});

export default app;

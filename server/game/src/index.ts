import { Hono, Context, Next } from 'hono';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { authMiddleware } from '../../middlewares/auth'; // Adjust path as necessary
import createRoom from '../routes/createRoom';
import getRoom from '../handlers/getRoom';
import joinRoom from '../routes/joinRoom';
import setGamemaster from '../routes/setGamemaster';
import leaveRoom from '../routes/leaveRoom';
import updateRoomSettings from '../routes/updateRoomSettings';
import getLeaderBoard from '../handlers/getLeaderBoard';
import testRank from '../routes/testRank';
import getRound from '../handlers/getRound';
import startRound from '../routes/startRound';
import endRound from '../routes/endRound';
import testGetRounds from '../handlers/testGetRounds';
import generateHintsFromPhoto from '../routes/generateHintsFromPhoto';
import submitPhoto from '../routes/submitPhoto';
import setPlayerName from '../routes/setPlayerName';
import { RoomObject } from '../roomObject';
// Remove import { set } from 'zod'; if not used directly for app config

// Define Bindings interface for Hono environment variables
interface Bindings {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  // Add other bindings from your wrangler.toml if needed, like RoomObject
  RoomObject: DurableObjectNamespace;
}

// Define a type for the context variables
interface AppVariables {
  supabase?: SupabaseClient;
  user?: any; // From authMiddleware
}

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

// Middleware to initialize Supabase client
app.use('*', async (c: Context<{ Bindings: Bindings; Variables: AppVariables }>, next: Next) => {
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_ANON_KEY) {
    console.error('Supabase URL or Anon Key not set in environment.');
    return c.json({ error: 'Configuration error: Supabase environment variables not set.' }, 500);
  }
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  c.set('supabase', supabase);
  await next();
});

// Apply JWT authentication middleware to all routes
app.use('*', authMiddleware);

// ルーティング登録
// Ensure these routes are compatible with the new context if they use it.
app.route('/', createRoom);
app.route('/', getRoom);
app.route('/', joinRoom);
app.route('/', setGamemaster);
app.route('/', leaveRoom);
app.route('/', updateRoomSettings);
app.route('/', getLeaderBoard);
app.route('/', testRank);
app.route('/', getRound);
app.route('/', startRound);
app.route('/', endRound);
app.route('/', testGetRounds);
app.route('/', generateHintsFromPhoto);
app.route('/', submitPhoto);
app.route('/', setPlayerName);

export { RoomObject };

export default {
  fetch: app.fetch,
  // Durable Object bindings are typically defined in wrangler.toml
  // and accessed via c.env.BINDING_NAME in Hono.
  // The explicit 'bindings' export here might be for a specific setup
  // or older wrangler version. Ensure it's compatible with your deployment.
};

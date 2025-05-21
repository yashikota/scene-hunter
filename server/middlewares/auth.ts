// server/middlewares/auth.ts

import { Context, Next } from 'hono';
import { SupabaseClient } from '@supabase/supabase-js';

// Define a type for the user object if you have a specific structure
// interface User {
//   id: string;
//   email?: string;
//   // Add other user properties as needed
// }

// Define a type for the context variables
interface AppVariables {
  user?: any; // Replace 'any' with your User type if defined
  supabase?: SupabaseClient;
}

// Auth middleware function
export const authMiddleware = async (c: Context<{ Variables: AppVariables }>, next: Next) => {
  // 1. Get the Supabase client from the context
  //    (assuming it's set by a previous middleware or in the app setup)
  const supabase = c.get('supabase');

  if (!supabase) {
    console.error('Supabase client not found in context.');
    return c.json({ error: 'Internal Server Error: Supabase client missing' }, 500);
  }

  // 2. Extract the JWT from the Authorization header
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ error: 'Missing Authorization Header' }, 401);
  }

  const tokenParts = authHeader.split(' ');
  if (tokenParts.length !== 2 || tokenParts[0].toLowerCase() !== 'bearer') {
    return c.json({ error: 'Invalid token format' }, 401);
  }
  const jwt = tokenParts[1];

  try {
    // 3. Verify the JWT and get user data
    const { data, error } = await supabase.auth.getUser(jwt);

    if (error) {
      console.error('JWT verification error:', error.message);
      return c.json({ error: 'Invalid token' }, 401);
    }

    if (!data || !data.user) {
      return c.json({ error: 'User not found for this token' }, 401);
    }

    // 4. If the token is valid, add the user object to the Hono context
    c.set('user', data.user);

    // 5. Call next() to proceed to the next middleware or handler
    await next();

  } catch (e) {
    console.error('Unexpected error during JWT verification:', e);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
};

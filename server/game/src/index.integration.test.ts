import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { testClient } from 'hono/testing';
import mainApp from './index'; // Main Hono app from server/game/src/index.ts
import { authMiddleware } from '../../middlewares/auth'; // The actual middleware
import { createClient } from '@supabase/supabase-js';

// Mock the Supabase client that authMiddleware will use
vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@supabase/supabase-js')>();
  const mockSupabaseInstance = {
    auth: {
      getUser: vi.fn(),
    },
    // Add any other Supabase client methods used by your app if necessary
  };
  return {
    ...original,
    createClient: vi.fn(() => mockSupabaseInstance as unknown as SupabaseClient),
  };
});


describe('Game Service Integration Tests with AuthMiddleware', () => {
  let client: ReturnType<typeof testClient>;
  let mockSupabaseAuthGetUser: vi.Mock;

  // Mock environment variables for the Hono app context
  const mockEnv = {
    SUPABASE_URL: 'http://mock-supabase.co',
    SUPABASE_ANON_KEY: 'mock-anon-key',
    // RoomObject: {} as any, // Mock Durable Object binding if routes hit it
  };

  beforeEach(() => {
    vi.resetAllMocks();

    // Get a fresh mock of createClient to access the mock instance's methods
    const mockedCreateClient = createClient as vi.Mock;
    const mockSupabaseInstance = mockedCreateClient(); // This gives us the instance with the mocked `auth.getUser`
    mockSupabaseAuthGetUser = mockSupabaseInstance.auth.getUser as vi.Mock;


    // Initialize the test client for the Hono app
    // The app instance `mainApp` from `index.ts` should already have the production middlewares
    // including the Supabase client setup and authMiddleware.
    client = testClient(mainApp, { env: mockEnv });
  });

  describe('POST /rooms (createRoom endpoint)', () => {
    it('should return 401 if Authorization header is missing', async () => {
      // Make a request to the POST /rooms endpoint (handled by createRoom.ts)
      // The mainApp in index.ts applies authMiddleware to all routes ('*')
      const res = await client.rooms.$post({
        json: { creator_id: 'test-user', rounds: 3 },
      });

      expect(res.status).toBe(401);
      const responseJson = await res.json();
      expect(responseJson.error).toBe('Missing Authorization Header');
    });

    it('should return 401 if JWT is invalid (supabase.auth.getUser returns error)', async () => {
      mockSupabaseAuthGetUser.mockResolvedValue({
        error: { message: 'Invalid token' },
        data: { user: null },
      });

      const res = await client.rooms.$post(
        { json: { creator_id: 'test-user', rounds: 3 } },
        { headers: { Authorization: 'Bearer invalid.jwt.token' } }
      );

      expect(res.status).toBe(401);
      const responseJson = await res.json();
      expect(responseJson.error).toBe('Invalid token');
    });

    it('should return 401 if JWT is valid but no user found', async () => {
      mockSupabaseAuthGetUser.mockResolvedValue({
        error: null,
        data: { user: null }, // No user object
      });

      const res = await client.rooms.$post(
        { json: { creator_id: 'test-user', rounds: 3 } },
        { headers: { Authorization: 'Bearer valid.jwt.but.no.user' } }
      );

      expect(res.status).toBe(401);
      const responseJson = await res.json();
      expect(responseJson.error).toBe('User not found for this token');
    });
    
    // This test depends on the actual route logic of createRoom.ts beyond just auth.
    // It assumes that if auth passes, the request proceeds to the route handler.
    // The createRoom handler itself has its own temporary auth check which we are bypassing
    // by providing a valid-looking token for the main authMiddleware.
    // For a true integration test of createRoom's logic, we'd need to mock DOs etc.
    it('should proceed to route handler if JWT is valid and user exists (expects 200 or other by route)', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' } as User;
      mockSupabaseAuthGetUser.mockResolvedValue({
        error: null,
        data: { user: mockUser },
      });

      // The createRoom handler in `server/game/routes/createRoom.ts` will then try to do its own logic.
      // It expects a `ROOM_OBJECT` in env, which is not fully mocked here beyond being present in mockEnv.
      // This will likely cause an error INSIDE the createRoom handler if it tries to use the DO.
      // For this test, we are primarily concerned that authMiddleware passed.
      // The actual createRoom handler has a temporary auth check `if (!auth || !auth.startsWith('Bearer '))`
      // which will pass because our test client sends the header.
      // Then it tries to use `c.env.ROOM_OBJECT`.
      
      // Let's mock the DO fetch to prevent errors within the route handler for this specific test
      const mockRoomObjectNamespace = {
        idFromName: vi.fn().mockReturnThis(),
        get: vi.fn().mockReturnThis(),
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "room-id", code: "123456" }), { status: 200 })) // Mock DO fetch
      };

      const clientWithMockDO = testClient(mainApp, { 
        env: { ...mockEnv, ROOM_OBJECT: mockRoomObjectNamespace as any } 
      });


      const res = await clientWithMockDO.rooms.$post(
        { json: { creator_id: mockUser.id, rounds: 3 } }, // Use mockUser.id
        { headers: { Authorization: 'Bearer valid.jwt.token' } }
      );

      // If authMiddleware worked, it shouldn't be a 401.
      // The status code will now depend on the createRoom handler.
      // Given we mocked the DO interaction successfully, it should be 200.
      expect(res.status).toBe(200); 
      const responseJson = await res.json();
      expect(responseJson.id).toBeDefined(); // Check if room object is returned
      expect(responseJson.host).toBe(mockUser.id);

      // Verify that c.set('user', mockUser) was called by the authMiddleware
      // This is harder to check directly with hono/testing as it's internal to the middleware chain.
      // The fact that we don't get a 401 and the route attempts to process is indirect proof.
    });
  });
});

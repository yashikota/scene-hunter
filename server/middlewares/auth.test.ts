import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authMiddleware } from './auth'; // Adjust path as necessary
import type { Context, Next } from 'hono';
import type { SupabaseClient, User } from '@supabase/supabase-js';

// Mock Supabase client and Hono context/next
vi.mock('@supabase/supabase-js', () => {
  const mockSupabaseClient = {
    auth: {
      getUser: vi.fn(),
    },
  };
  return {
    createClient: vi.fn(() => mockSupabaseClient),
    SupabaseClient: vi.fn(() => mockSupabaseClient), // Mock the class constructor
  };
});

const mockNext: Next = vi.fn();

describe('authMiddleware', () => {
  let mockCtx: Context & { req: any; json: any; header: any; get: any; set: any }; // More specific mock for Context
  let mockSupabase: ReturnType<typeof SupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks before each test

    // @ts-ignore - We are mocking SupabaseClient, this is fine for tests
    mockSupabase = new SupabaseClient('mock-url', 'mock-key');

    mockCtx = {
      req: {
        header: vi.fn(),
      },
      json: vi.fn((data, status) => ({ data, status })), // Mock c.json to inspect its arguments
      get: vi.fn(),
      set: vi.fn(),
      // Add other context properties if your middleware uses them
    } as unknown as Context & { req: any; json: any; header: any; get: any; set: any };
  });

  it('should return 401 if Authorization header is missing', async () => {
    mockCtx.req.header.mockReturnValue(undefined); // No Authorization header
    mockCtx.get.mockReturnValue(mockSupabase); // Supabase client is available

    const result = await authMiddleware(mockCtx, mockNext);

    expect(mockCtx.req.header).toHaveBeenCalledWith('Authorization');
    expect(result.status).toBe(401);
    expect(result.data.error).toBe('Missing Authorization Header');
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockCtx.set).not.toHaveBeenCalled();
  });

  it('should return 401 if Authorization header is malformed (not Bearer)', async () => {
    mockCtx.req.header.mockReturnValue('Basic somecredentials'); // Malformed header
    mockCtx.get.mockReturnValue(mockSupabase);

    const result = await authMiddleware(mockCtx, mockNext);

    expect(result.status).toBe(401);
    expect(result.data.error).toBe('Invalid token format');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 if Authorization header is Bearer but no token', async () => {
    mockCtx.req.header.mockReturnValue('Bearer '); // No token
    mockCtx.get.mockReturnValue(mockSupabase);

    const result = await authMiddleware(mockCtx, mockNext);
    expect(result.status).toBe(401);
    expect(result.data.error).toBe('Invalid token format'); // or a more specific message if you change the logic
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 if supabase.auth.getUser() returns an error', async () => {
    const errorMessage = 'Invalid token';
    mockCtx.req.header.mockReturnValue('Bearer valid.jwt.token');
    mockCtx.get.mockReturnValue(mockSupabase);
    (mockSupabase.auth.getUser as vi.Mock).mockResolvedValue({ error: { message: errorMessage }, data: null });

    const result = await authMiddleware(mockCtx, mockNext);

    expect(mockSupabase.auth.getUser).toHaveBeenCalledWith('valid.jwt.token');
    expect(result.status).toBe(401);
    expect(result.data.error).toBe('Invalid token');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 if supabase.auth.getUser() returns no user data', async () => {
    mockCtx.req.header.mockReturnValue('Bearer valid.jwt.token');
    mockCtx.get.mockReturnValue(mockSupabase);
    (mockSupabase.auth.getUser as vi.Mock).mockResolvedValue({ error: null, data: { user: null } }); // No user

    const result = await authMiddleware(mockCtx, mockNext);

    expect(result.status).toBe(401);
    expect(result.data.error).toBe('User not found for this token');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should call c.set("user", ...) and next() if token is valid', async () => {
    const mockUser = { id: '123', email: 'test@example.com' } as User;
    mockCtx.req.header.mockReturnValue('Bearer valid.jwt.token');
    mockCtx.get.mockReturnValue(mockSupabase);
    (mockSupabase.auth.getUser as vi.Mock).mockResolvedValue({ error: null, data: { user: mockUser } });

    await authMiddleware(mockCtx, mockNext);

    expect(mockSupabase.auth.getUser).toHaveBeenCalledWith('valid.jwt.token');
    expect(mockCtx.set).toHaveBeenCalledWith('user', mockUser);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should return 500 if Supabase client is not found in context', async () => {
    mockCtx.get.mockReturnValue(undefined); // Supabase client not available

    const result = await authMiddleware(mockCtx, mockNext);

    expect(mockCtx.get).toHaveBeenCalledWith('supabase');
    expect(result.status).toBe(500);
    expect(result.data.error).toBe('Internal Server Error: Supabase client missing');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should handle unexpected errors during JWT verification', async () => {
    mockCtx.req.header.mockReturnValue('Bearer valid.jwt.token');
    mockCtx.get.mockReturnValue(mockSupabase);
    (mockSupabase.auth.getUser as vi.Mock).mockRejectedValue(new Error('Unexpected Supabase error'));

    const result = await authMiddleware(mockCtx, mockNext);

    expect(result.status).toBe(500);
    expect(result.data.error).toBe('Internal Server Error');
    expect(mockNext).not.toHaveBeenCalled();
  });
});

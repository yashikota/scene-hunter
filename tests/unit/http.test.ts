import { describe, expect, it } from 'vite-plus/test';
import { errorResponse, tooMany } from '../../src/server/deps';
import { AuthError, NotFoundError } from '../../src/server/services/rooms';

const c = { json: (body: unknown, status: number) => ({ body, status }) } as never;

describe('errorResponse', () => {
  it('例外の種類を状態コードに直す', () => {
    expect(errorResponse(c, new RangeError('x'))).toMatchObject({ status: 400 });
    expect(errorResponse(c, new AuthError('x'))).toMatchObject({ status: 401 });
    expect(errorResponse(c, new NotFoundError('x'))).toMatchObject({ status: 404 });
    expect(tooMany(c)).toMatchObject({ status: 429 });
  });

  it('想定外の例外はそのまま投げる', () => {
    expect(() => errorResponse(c, new Error('boom'))).toThrow('boom');
  });
});

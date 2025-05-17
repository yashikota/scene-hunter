import { Context } from 'hono';
import { z } from 'zod';

declare module 'hono' {
  interface ContextVariableMap {
    // 既存の定義はそのまま
  }

  // zValidator用の型定義
  export function zValidator<
    T extends z.ZodTypeAny,
    Target extends 'json' | 'form' | 'query' | 'param'
  >(
    target: Target,
    schema: T
  ): any;

  // Context拡張
  interface Context {
    req: {
      valid<T extends 'json' | 'form' | 'query' | 'param'>(target: T): any;
    } & Context['req'];
  }
}

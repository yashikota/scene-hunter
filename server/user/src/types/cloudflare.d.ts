declare global {
  /**
   * Cloudflare Workers D1データベースの型定義
   */
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    dump(): Promise<ArrayBuffer>;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec<T = unknown>(query: string): Promise<D1Result<T>>;
  }

  /**
   * D1プリペアドステートメントの型定義
   */
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(colName?: string): Promise<T | null>;
    run<T = unknown>(): Promise<D1Result<T>>;
    all<T = unknown>(): Promise<D1Result<T>>;
    raw<T = unknown>(): Promise<T[]>;
  }

  /**
   * D1実行結果の型定義
   */
  interface D1Result<T = unknown> {
    results?: T[];
    success: boolean;
    error?: string;
    meta: {
      duration: number;
      changes?: number;
      last_row_id?: number;
      served_by?: string;
      changes_count?: number;
    };
  }

  /**
   * Web Crypto API
   */
  const crypto: Crypto;

  /**
   * Console API
   */
  interface Console {
    log(...data: any[]): void;
    error(...data: any[]): void;
    warn(...data: any[]): void;
    info(...data: any[]): void;
    debug(...data: any[]): void;
    trace(...data: any[]): void;
  }

  const console: Console;
}

/**
 * Cloudflare Workersのバインディング型定義
 */
export interface Env {
  USER_DB: D1Database;
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

/**
 * Cloudflare Workersのコンテキスト型定義
 */
declare module 'hono' {
  interface ContextVariableMap {
    user: {
      id: string;
      email?: string;
      app_metadata?: {
        roles?: string[];
      };
    };
    server?: {
      isGameServer: boolean;
    };
  }
}

export { };

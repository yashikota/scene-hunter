import type { Context, Next } from "hono";

/**
 * エラーコード
 */
export type ErrorCode =
  | "invalid_request"
  | "invalid_parameter"
  | "missing_parameter"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limit_exceeded"
  | "internal_error";

/**
 * APIエラー
 */
export class ApiError extends Error {
  code: ErrorCode;
  statusCode: number;

  constructor(code: ErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
  }

  static badRequest(
    message: string,
    code:
      | "invalid_request"
      | "invalid_parameter"
      | "missing_parameter" = "invalid_request",
  ): ApiError {
    return new ApiError(code, message, 400);
  }

  static unauthorized(message: string): ApiError {
    return new ApiError("unauthorized", message, 401);
  }

  static forbidden(message: string): ApiError {
    return new ApiError("forbidden", message, 403);
  }

  static notFound(message: string): ApiError {
    return new ApiError("not_found", message, 404);
  }

  static conflict(message: string): ApiError {
    return new ApiError("conflict", message, 409);
  }

  static tooManyRequests(message: string): ApiError {
    return new ApiError("rate_limit_exceeded", message, 429);
  }

  static internal(message: string): ApiError {
    return new ApiError("internal_error", message, 500);
  }
}

/**
 * エラーハンドラーミドルウェア
 * エラーをキャッチして適切なレスポンスを返す
 * @returns ミドルウェア関数
 */
export const errorHandler = () => {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      console.error("Error:", error);

      if (error instanceof ApiError) {
        return c.json(
          {
            code: error.code,
            message: error.message,
          },
          error.statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500,
        );
      }

      // 未知のエラー
      return c.json(
        {
          code: "internal_error",
          message: "内部サーバーエラーが発生しました",
        },
        500,
      );
    }
  };
};

import "@typespec/http";
import "@typespec/openapi3";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace SceneHunter.Models;

/**
 * 成功レスポンス
 */
model SuccessResponse {
  /** 成功したかどうか */
  success: boolean;
}

/**
 * エラーコード
 *
 * - `invalid_request`: リクエストの形式が不正
 * - `invalid_parameter`: パラメータの値が不正
 * - `missing_parameter`: 必須パラメータが不足
 * - `unauthorized`: 認証が必要
 * - `forbidden`: 権限がない
 * - `not_found`: リソースが見つからない
 * - `conflict`: リソースの競合
 * - `rate_limit_exceeded`: レート制限超過
 * - `internal_error`: 内部エラー
 */
enum ErrorCode {
  /** リクエストの形式が不正 */
  invalid_request,

  /** パラメータの値が不正 */
  invalid_parameter,

  /** 必須パラメータが不足 */
  missing_parameter,

  /** 認証が必要 */
  unauthorized,

  /** 権限がない */
  forbidden,

  /** リソースが見つからない */
  not_found,

  /** リソースの競合 */
  conflict,

  /** レート制限超過 */
  rate_limit_exceeded,

  /** 内部エラー */
  internal_error,
}

/**
 * エラーレスポンス
 *
 * 各エンドポイントで発生する可能性のあるエラーコードと対応するHTTPステータスコード：
 *
 * | エラーコード | HTTPステータスコード | 説明 |
 * |------------|-------------------|------|
 * | `invalid_request` | 400 | リクエストの形式が不正 |
 * | `invalid_parameter` | 400 | パラメータの値が不正 |
 * | `missing_parameter` | 400 | 必須パラメータが不足 |
 * | `unauthorized` | 401 | 認証が必要 |
 * | `forbidden` | 403 | 権限がない |
 * | `not_found` | 404 | リソースが見つからない |
 * | `conflict` | 409 | リソースの競合 |
 * | `rate_limit_exceeded` | 429 | レート制限超過 |
 * | `internal_error` | 500 | 内部エラー |
 */
@error
model ErrorResponse {
  /** エラーコード */
  code: ErrorCode;

  /** エラーメッセージ */
  message: string;
}

/**
 * 400 Bad Request エラーレスポンス
 */
@error
model BadRequestResponse {
  @statusCode _: 400;

  /** エラーコード */
  code: "invalid_request" | "invalid_parameter" | "missing_parameter";

  /** エラーメッセージ */
  message: string;
}

/**
 * 401 Unauthorized エラーレスポンス
 */
@error
model UnauthorizedResponse {
  @statusCode _: 401;

  /** エラーコード */
  code: "unauthorized";

  /** エラーメッセージ */
  message: string;
}

/**
 * 403 Forbidden エラーレスポンス
 */
@error
model ForbiddenResponse {
  @statusCode _: 403;

  /** エラーコード */
  code: "forbidden";

  /** エラーメッセージ */
  message: string;
}

/**
 * 404 Not Found エラーレスポンス
 */
@error
model NotFoundResponse {
  @statusCode _: 404;

  /** エラーコード */
  code: "not_found";

  /** エラーメッセージ */
  message: string;
}

/**
 * 409 Conflict エラーレスポンス
 */
@error
model ConflictResponse {
  @statusCode _: 409;

  /** エラーコード */
  code: "conflict";

  /** エラーメッセージ */
  message: string;
}

/**
 * 429 Too Many Requests エラーレスポンス
 */
@error
model TooManyRequestsResponse {
  @statusCode _: 429;

  /** エラーコード */
  code: "rate_limit_exceeded";

  /** エラーメッセージ */
  message: string;
}

/**
 * 500 Internal Server Error エラーレスポンス
 */
@error
model InternalServerErrorResponse {
  @statusCode _: 500;

  /** エラーコード */
  code: "internal_error";

  /** エラーメッセージ */
  message: string;
}

/**
 * タイムスタンプ型
 */
scalar Timestamp extends string;

/**
 * UUID型
 */
scalar UUID extends string;

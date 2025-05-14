import "@typespec/http";
import "@typespec/openapi3";
import "../models/main.tsp";

using TypeSpec.Http;

namespace SceneHunter.Routes;

// マルチパートフォームデータのリクエスト
model FormDataRequest {
  @bodyRoot contentType: "multipart/form-data";
  @multipartBody body: {
    image: HttpPart<{
      @body content: bytes;
      @header contentType: "application/octet-stream";
    }>;
    w?: int32;
    h?: int32;
    q?: int32;
    f?: string;
    filename: string;
  };
}

// 画像レスポンス
model JpegImageResponse {
  @header contentType: "image/jpeg";
  @body content: bytes;
}

@route("images")
@tag("Images")
interface Images {
  /**
   * 画像をアップロードする
   */
  @post
  @route("upload")
  @summary("画像をアップロードする")
  @useAuth(BearerAuth)
  uploadImage(@body request: FormDataRequest):
    | Models.ImageUploadResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.InternalServerErrorResponse;

  /**
   * ファイルを取得する
   */
  @get
  @route("file/{path}")
  @summary("ファイルを取得する")
  @useAuth(BearerAuth)
  getFile(@path path: string):
    | JpegImageResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * ファイルを削除する
   */
  @delete
  @route("file/{path}")
  @summary("ファイルを削除する")
  @useAuth(BearerAuth)
  deleteFile(@path path: string):
    | Models.SuccessResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * バケット内のファイルを全て削除する
   */
  @delete
  @route("bucket/{prefix}")
  @summary("バケット内のファイルを全て削除する")
  @useAuth(BearerAuth)
  deleteBucket(@path prefix: string):
    | Models.SuccessResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * ファイル一覧を取得する
   */
  @get
  @route("list")
  @summary("ファイル一覧を取得する")
  @useAuth(BearerAuth)
  listFiles():
    | Models.FileListResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.InternalServerErrorResponse;
}

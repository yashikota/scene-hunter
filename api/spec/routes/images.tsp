import "@typespec/http";
import "@typespec/openapi3";
import "../models/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace SceneHunter.Routes;

// マルチパートフォームデータのリクエスト
model FormDataRequest {
  @bodyRoot contentType: "multipart/form-data";
  @multipartBody body: {
    file: HttpPart<{
      @body content: bytes;
      @header contentType: "application/octet-stream";
    }>;
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
   * 画像を取得する
   */
  @get
  @route("{image_id}")
  @summary("画像を取得する")
  @useAuth(BearerAuth)
  getImage(@path image_id: Models.UUID):
    | JpegImageResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * 画像情報を取得する
   */
  @get
  @route("{image_id}/info")
  @summary("画像情報を取得する")
  @useAuth(BearerAuth)
  getImageInfo(@path image_id: Models.UUID):
    | Models.Image
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * 画像特徴を取得する
   */
  @get
  @route("{image_id}/features")
  @summary("画像特徴を取得する")
  @useAuth(BearerAuth)
  getImageFeatures(@path image_id: Models.UUID):
    | Models.ImageFeatures
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * 画像マッチングを行う
   */
  @post
  @route("match")
  @summary("画像マッチングを行う")
  @useAuth(BearerAuth)
  matchImages(@body request: Models.ImageMatchRequest):
    | Models.ImageMatchResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.InternalServerErrorResponse;
}

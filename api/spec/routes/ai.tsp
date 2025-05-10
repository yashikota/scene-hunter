import "@typespec/http";
import "@typespec/openapi3";
import "../models/main.tsp";

using TypeSpec.Http;

namespace SceneHunter.Routes;

@route("ai")
@tag("AI")
interface AI {
  /**
   * 画像を分析する
   */
  @post
  @route("analyze")
  @summary("画像を分析する")
  @useAuth(BearerAuth)
  analyzeImage(@body request: Models.AnalyzeImageRequest):
    | Models.AnalyzeImageResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.ForbiddenResponse
    | Models.TooManyRequestsResponse
    | Models.InternalServerErrorResponse;

  /**
   * AIの情報を取得する
   */
  @get
  @route("info")
  @summary("AIの情報を取得する")
  @useAuth(BearerAuth)
  getAiInfo():
    | Models.AiInfo
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.ForbiddenResponse
    | Models.ErrorResponse;
}

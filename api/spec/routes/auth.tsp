import "@typespec/http";
import "@typespec/openapi3";
import "../models/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace SceneHunter.Routes;

@route("auth")
@tag("Auth")
interface Auth {
  /**
   * プレイヤーを登録する
   */
  @post
  @route("register")
  @summary("プレイヤーを登録する")
  @useAuth(NoAuth)
  registerPlayer(@body request: Models.RegisterPlayerRequest):
    | Models.RegisterPlayerResponse
    | Models.BadRequestResponse
    | Models.ConflictResponse
    | Models.InternalServerErrorResponse;

  /**
   * プレイヤーとしてログインする
   */
  @post
  @route("login")
  @summary("プレイヤーとしてログインする")
  @useAuth(NoAuth)
  loginPlayer(@body request: Models.LoginPlayerRequest):
    | Models.LoginPlayerResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.InternalServerErrorResponse;

  /**
   * トークンを更新する
   */
  @post
  @route("refresh")
  @summary("トークンを更新する")
  @useAuth(BearerAuth)
  refreshToken(@body request: Models.RefreshTokenRequest):
    | Models.RefreshTokenResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.InternalServerErrorResponse;
}

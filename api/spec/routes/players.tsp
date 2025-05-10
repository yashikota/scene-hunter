import "@typespec/http";
import "@typespec/openapi3";
import "../models/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace SceneHunter.Routes;

@route("players")
@tag("Players")
interface Players {
  /**
   * プレイヤー情報を取得する
   */
  @get
  @route("{player_id}")
  @summary("プレイヤー情報を取得する")
  @useAuth(BearerAuth)
  getPlayer(@path player_id: Models.UUID):
    | Models.Player
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * プレイヤー名を更新する
   */
  @put
  @route("{player_id}")
  @summary("プレイヤー名を更新する")
  @useAuth(BearerAuth)
  updatePlayerName(
    @path player_id: Models.UUID,
    @body request: Models.UpdatePlayerNameRequest,
  ):
    | Models.Player
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.ForbiddenResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;
}

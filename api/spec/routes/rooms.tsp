import "@typespec/http";
import "@typespec/openapi3";
import "../models/main.tsp";

using TypeSpec.Http;

namespace SceneHunter.Routes;

@route("rooms")
@tag("Rooms")
interface Rooms {
  /**
   * ルームを作成する
   */
  @post
  @summary("ルームを作成する")
  @useAuth(BearerAuth)
  createRoom(@body request: Models.CreateRoomRequest):
    | Models.CreateRoomResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.InternalServerErrorResponse;

  /**
   * ルーム情報を取得する
   */
  @get
  @route("{room_id}")
  @summary("ルーム情報を取得する")
  @useAuth(BearerAuth)
  getRoom(@path room_id: Models.UUID):
    | Models.Room
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * ルームに参加する
   */
  @post
  @route("{room_id}/join")
  @summary("ルームに参加する")
  @useAuth(BearerAuth)
  joinRoom(@path room_id: Models.UUID, @body request: Models.JoinRoomRequest):
    | Models.SuccessResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.ConflictResponse
    | Models.InternalServerErrorResponse;

  /**
   * ルームから退出する
   */
  @post
  @route("{room_id}/leave")
  @summary("ルームから退出する")
  @useAuth(BearerAuth)
  leaveRoom(
    @path room_id: Models.UUID,
    @body request: Models.LeaveRoomRequest,
  ):
    | Models.SuccessResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * ゲームマスターを設定する
   */
  @put
  @route("{room_id}/gamemaster")
  @summary("ゲームマスターを設定する")
  @useAuth(BearerAuth)
  setGameMaster(
    @path room_id: Models.UUID,
    @body request: Models.SetGameMasterRequest,
  ):
    | Models.SuccessResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.ForbiddenResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * ルーム設定を更新する
   */
  @put
  @route("{room_id}/settings")
  @summary("ルーム設定を更新する")
  @useAuth(BearerAuth)
  updateRoomSettings(
    @path room_id: Models.UUID,
    @body request: Models.UpdateRoomSettingsRequest,
  ):
    | Models.SuccessResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.ForbiddenResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;
}

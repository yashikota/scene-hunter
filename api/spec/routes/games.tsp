import "@typespec/http";
import "@typespec/openapi3";
import "../models/main.tsp";

using TypeSpec.Http;

namespace SceneHunter.Routes;

// マルチパートフォームデータのリクエスト
model PhotoFormDataRequest {
  @bodyRoot contentType: "multipart/form-data";
  @multipartBody body: {
    photo: HttpPart<{
      @body content: bytes;
      @header contentType: "application/octet-stream";
    }>;
  };
}

@route("rooms/{room_id}/rounds")
@tag("Rounds")
namespace Rounds {
  /**
   * ラウンドを開始する
   */
  @post
  @route("{round_id}/start")
  @summary("ラウンドを開始する")
  @useAuth(BearerAuth)
  op startRound(
    @path room_id: Models.UUID,
    @path round_id: Models.UUID,
    @body request: Models.StartRoundRequest,
  ):
    | Models.StartRoundResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.ForbiddenResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * ラウンドを終了する
   */
  @post
  @route("{round_id}/end")
  @summary("ラウンドを終了する")
  @useAuth(BearerAuth)
  op endRound(@path room_id: Models.UUID, @path round_id: Models.UUID):
    | Models.SuccessResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.ForbiddenResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * ラウンド情報を取得する
   */
  @get
  @route("{round_id}")
  @summary("ラウンド情報を取得する")
  @useAuth(BearerAuth)
  op getRound(@path room_id: Models.UUID, @path round_id: Models.UUID):
    | Models.Round
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * ラウンドの公開済みヒントを取得する
   */
  @get
  @route("{round_id}/hints")
  @summary("ラウンドの公開済みヒントを取得する")
  @useAuth(BearerAuth)
  op getRoundHints(@path room_id: Models.UUID, @path round_id: Models.UUID):
    | Models.RoundHints
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * 写真を提出する
   */
  @post
  @route("{round_id}/photo")
  @summary("写真を提出する")
  @useAuth(BearerAuth)
  op submitMasterPhoto(
    @path room_id: Models.UUID,
    @path round_id: Models.UUID,
    @body request: {
      player_id: Models.UUID;
      photo: PhotoFormDataRequest;
    },
  ):
    | Models.PhotoSubmissionResponse
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.ForbiddenResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;

  /**
   * ラウンド結果を取得する
   */
  @get
  @route("{round_id}/results")
  @summary("ラウンド結果を取得する")
  @useAuth(BearerAuth)
  op getRoundResults(@path room_id: Models.UUID, @path round_id: Models.UUID):
    | Models.RoundResult
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;
}

@route("rooms/{room_id}/leaderboard")
@tag("Rooms")
interface Leaderboard {
  /**
   * リーダーボードを取得する
   */
  @get
  @summary("リーダーボードを取得する")
  @useAuth(BearerAuth)
  getLeaderboard(@path room_id: Models.UUID):
    | Models.Leaderboard
    | Models.BadRequestResponse
    | Models.UnauthorizedResponse
    | Models.NotFoundResponse
    | Models.InternalServerErrorResponse;
}

import "@typespec/http";
import "@typespec/openapi3";
import "../models/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace SceneHunter.Routes;

@route("health")
@tag("Health")
interface Health {
  /**
   * ヘルスチェック
   */
  @get
  @summary("ヘルスチェック")
  @useAuth(NoAuth)
  checkHealth(
  ): Models.SuccessResponse | Models.BadRequestResponse | Models.InternalServerErrorResponse;
}

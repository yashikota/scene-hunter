import "@typespec/http";
import "@typespec/openapi3";
import "@typespec/versioning";

import "./models/main.tsp";
import "./routes/main.tsp";

using TypeSpec.Http;

/**
 * Scene Hunter API
 */
@service(#{ title: "Scene Hunter API" })
@Versioning.versioned(ApiVersion)
@server("http://localhost:4282", "dev")
@server("https://scene-hunter.yashikota.com/api", "prd")
namespace SceneHunter;

enum ApiVersion {
  v1,
}

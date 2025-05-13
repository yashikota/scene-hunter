package api

import (
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/yashikota/scene-hunter/server/image/config"
	"github.com/yashikota/scene-hunter/server/image/internal/auth"
	"github.com/yashikota/scene-hunter/server/image/pkg/util"
)

// SetupRoutes はルーティングを設定する
func SetupRoutes(e *echo.Echo, cfg *config.Config, handler *Handler, authManager *auth.Manager) {
	// エラーハンドラーを設定
	e.HTTPErrorHandler = util.ErrorHandler()

	// ミドルウェアを設定
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	// APIグループを作成
	api := e.Group("/v1")

	// 認証が有効な場合は認証ミドルウェアを設定
	if cfg.Auth.Enabled {
		api.Use(authManager.Middleware())
	}

	// 画像エンドポイント
	images := api.Group("/images")
	images.POST("", handler.UploadImage)
	images.GET("", handler.ListImages)
	images.GET("/:id", handler.GetImage)
	images.GET("/:id/metadata", handler.GetImageMetadata)
	images.DELETE("/:id", handler.DeleteImage)

	// ヘルスチェックエンドポイント
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(200, map[string]string{
			"status": "ok",
		})
	})
}

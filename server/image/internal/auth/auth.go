package auth

import (
	"github.com/labstack/echo/v4"
	"github.com/yashikota/scene-hunter/server/image/config"
)

// Manager は認証を管理する
type Manager struct {
	JWT     *JWTAuth
	Enabled bool
}

// NewManager は認証マネージャーを作成する
func NewManager(cfg *config.Config) *Manager {
	manager := &Manager{
		Enabled: cfg.Auth.Enabled,
	}

	if cfg.Auth.Enabled {
		manager.JWT = NewJWTAuth(&cfg.Auth.JWT)
	}

	return manager
}

// Middleware は認証ミドルウェアを返す
func (m *Manager) Middleware() echo.MiddlewareFunc {
	// 認証が無効の場合は空のミドルウェアを返す
	if !m.Enabled || m.JWT == nil {
		return func(next echo.HandlerFunc) echo.HandlerFunc {
			return func(c echo.Context) error {
				return next(c)
			}
		}
	}

	// JWTAuthのミドルウェアを返す
	return m.JWT.Middleware()
}

// extractBearerToken は Authorization ヘッダーからBearerトークンを抽出する
func extractBearerToken(auth string) string {
	if auth == "" {
		return ""
	}

	const prefix = "Bearer "
	if len(auth) < len(prefix) || auth[:len(prefix)] != prefix {
		return ""
	}

	return auth[len(prefix):]
}

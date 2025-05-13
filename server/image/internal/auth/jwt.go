package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/lestrrat-go/jwx/v2/jwa"
	"github.com/lestrrat-go/jwx/v2/jwt"
	"github.com/yashikota/scene-hunter/server/image/config"
)

// JWTAuth はJWT認証を実装する
type JWTAuth struct {
	Secret []byte
	Expiry time.Duration
	Issuer string
}

// NewJWTAuth はJWT認証を作成する
func NewJWTAuth(cfg *config.JWTConfig) *JWTAuth {
	return &JWTAuth{
		Secret: []byte(cfg.Secret),
		Expiry: cfg.Expiry,
		Issuer: cfg.Issuer,
	}
}

// Middleware はJWT認証ミドルウェアを返す
func (j *JWTAuth) Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			auth := c.Request().Header.Get("Authorization")
			if auth == "" {
				return echo.ErrUnauthorized
			}

			token := extractBearerToken(auth)
			if token == "" {
				return echo.ErrUnauthorized
			}

			valid, claims, err := j.Validate(token)
			if err != nil || !valid {
				return echo.ErrUnauthorized
			}

			c.Set("user", claims)
			c.Set("auth_method", "jwt")
			return next(c)
		}
	}
}

// Validate はJWTトークンを検証する
func (j *JWTAuth) Validate(tokenString string) (bool, map[string]interface{}, error) {
	// トークンを解析して検証
	token, err := jwt.Parse(
		[]byte(tokenString),
		jwt.WithKey(jwa.HS256, j.Secret),
		jwt.WithValidate(true),
		jwt.WithIssuer(j.Issuer),
	)
	if err != nil {
		return false, nil, fmt.Errorf("トークンの検証に失敗しました: %w", err)
	}

	// 有効期限を確認
	if token.Expiration().Before(time.Now()) {
		return false, nil, fmt.Errorf("トークンの有効期限が切れています")
	}

	// クレームを取得
	claims := make(map[string]interface{})
	ctx := context.Background()
	for iter := token.Iterate(ctx); iter.Next(ctx); {
		pair := iter.Pair()
		claims[pair.Key.(string)] = pair.Value
	}

	return true, claims, nil
}

// GenerateToken は新しいJWTトークンを生成する
func (j *JWTAuth) GenerateToken(userID string, additionalClaims map[string]interface{}) (string, error) {
	now := time.Now()
	token := jwt.New()

	// 標準クレームを設定
	_ = token.Set(jwt.IssuerKey, j.Issuer)
	_ = token.Set(jwt.IssuedAtKey, now)
	_ = token.Set(jwt.ExpirationKey, now.Add(j.Expiry))
	_ = token.Set("user_id", userID)

	// 追加のクレームを設定
	for k, v := range additionalClaims {
		_ = token.Set(k, v)
	}

	// トークンを署名
	signedToken, err := jwt.Sign(token, jwt.WithKey(jwa.HS256, j.Secret))
	if err != nil {
		return "", fmt.Errorf("トークンの署名に失敗しました: %w", err)
	}

	return string(signedToken), nil
}

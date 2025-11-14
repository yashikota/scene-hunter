// Package middleware provides Connect interceptors for authentication and authorization.
package middleware

import (
	"context"
	"os"
	"slices"
	"strings"

	"connectrpc.com/connect"
	domainauth "github.com/yashikota/scene-hunter/server/internal/domain/auth"
)

// contextKey is a type for context keys to avoid collisions.
type contextKey string

const (
	// AnonIDContextKey is the context key for storing anon_id.
	AnonIDContextKey contextKey = "anon_id"
	// UserIDContextKey is the context key for storing user_id.
	UserIDContextKey contextKey = "user_id"
)

// AuthInterceptor creates a Connect interceptor that verifies authentication tokens.
func AuthInterceptor() connect.UnaryInterceptorFunc {
	hmacSecret := os.Getenv("AUTH_HMAC_SECRET")
	if hmacSecret == "" {
		panic("AUTH_HMAC_SECRET environment variable is required")
	}

	tokenSigner := domainauth.NewTokenSigner([]byte(hmacSecret))

	interceptor := func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			// Skip authentication for certain endpoints
			if shouldSkipAuth(req.Spec().Procedure) {
				return next(ctx, req)
			}

			// Extract token from Authorization header
			authHeader := req.Header().Get("Authorization")
			if authHeader == "" {
				return nil, connect.NewError(connect.CodeUnauthenticated, nil)
			}

			// Check Bearer token format
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || parts[0] != "Bearer" {
				return nil, connect.NewError(connect.CodeUnauthenticated, nil)
			}

			token := parts[1]

			// Verify token
			anonToken, err := tokenSigner.VerifyAnonToken(token)
			if err != nil {
				return nil, connect.NewError(connect.CodeUnauthenticated, err)
			}

		// Store ID in context
		// Note: Current implementation uses the same token format for both anonymous and permanent users.
		// The AnonID field contains either the anon_id (for anonymous users) or user_id (for permanent users).
		//nolint:godox // TODO: Add a token type field to distinguish between anonymous and permanent users,
		// and store in appropriate context keys (AnonIDContextKey vs UserIDContextKey).
		ctx = context.WithValue(ctx, AnonIDContextKey, anonToken.AnonID)

			return next(ctx, req)
		}
	}

	return interceptor
}

// shouldSkipAuth determines if authentication should be skipped for a procedure.
func shouldSkipAuth(procedure string) bool {
	// Skip authentication for these endpoints
	skipProcedures := []string{
		"/scene_hunter.v1.HealthService/Check",
		"/scene_hunter.v1.StatusService/GetStatus",
		"/scene_hunter.v1.AuthService/IssueAnon",
		"/scene_hunter.v1.AuthService/RefreshAnon",
		"/scene_hunter.v1.AuthService/RevokeAnon",
		"/scene_hunter.v1.AuthService/UpgradeAnonWithGoogle",
	}

	return slices.Contains(skipProcedures, procedure)
}

// GetAnonIDFromContext retrieves the anon_id from context.
func GetAnonIDFromContext(ctx context.Context) (string, bool) {
	anonID, ok := ctx.Value(AnonIDContextKey).(string)

	return anonID, ok
}

// GetUserIDFromContext retrieves the user_id from context.
func GetUserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(UserIDContextKey).(string)

	return userID, ok
}

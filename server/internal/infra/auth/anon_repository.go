// Package auth provides authentication infrastructure implementations.
package auth

import (
	"context"
	"encoding/json"
	"time"

	domainauth "github.com/yashikota/scene-hunter/server/internal/domain/auth"
	domainkvs "github.com/yashikota/scene-hunter/server/internal/domain/kvs"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// AnonRepository implements domainauth.AnonRepository using Valkey.
type AnonRepository struct {
	kvs domainkvs.KVS
}

// NewAnonRepository creates a new AnonRepository.
func NewAnonRepository(kvs domainkvs.KVS) domainauth.AnonRepository {
	return &AnonRepository{
		kvs: kvs,
	}
}

// refreshTokenData represents the data stored in Valkey for a refresh token.
// Internal JSON structure uses snake_case for Redis compatibility.
//
//nolint:tagliatelle
type refreshTokenData struct {
	ID         string `json:"id"`
	AnonID     string `json:"anon_id"`
	TokenHash  string `json:"token_hash"`
	ExpiresAt  int64  `json:"expires_at"`   // Unix timestamp
	Used       bool   `json:"used"`
	UserAgent  string `json:"user_agent"`
	CreatedAt  int64  `json:"created_at"`   // Unix timestamp
	LastUsedAt int64  `json:"last_used_at"` // Unix timestamp
}

// SaveRefreshToken stores a refresh token with TTL.
func (r *AnonRepository) SaveRefreshToken(
	ctx context.Context,
	token *domainauth.RefreshToken,
) error {
	data := refreshTokenData{
		ID:         token.ID,
		AnonID:     token.AnonID,
		TokenHash:  token.TokenHash,
		ExpiresAt:  token.ExpiresAt.Unix(),
		Used:       token.Used,
		UserAgent:  token.UserAgent,
		CreatedAt:  token.CreatedAt.Unix(),
		LastUsedAt: token.LastUsedAt.Unix(),
	}

	dataJSON, err := json.Marshal(data)
	if err != nil {
		return errors.Errorf("failed to marshal token data: %w", err)
	}

	ttl := time.Until(token.ExpiresAt)
	if ttl <= 0 {
		return errors.Errorf("token already expired")
	}

	// Store token data
	key := r.tokenKey(token.ID)
	//nolint:noinlineerr // Inline error handling is clearer here
	if err := r.kvs.Set(ctx, key, string(dataJSON), ttl); err != nil {
		return errors.Errorf("failed to save refresh token: %w", err)
	}

	// Add to anon_id index (for revocation) using a set
	anonKey := r.anonTokensKey(token.AnonID)
	//nolint:noinlineerr // Inline error handling is clearer here
	if err := r.kvs.SAdd(ctx, anonKey, token.ID); err != nil {
		return errors.Errorf("failed to index token by anon_id: %w", err)
	}

	// Set expiration for the set key, but only if it's longer than the current TTL
	// This prevents overwriting a longer TTL with a shorter one when multiple tokens exist
	currentTTL, err := r.kvs.TTL(ctx, anonKey)
	if err != nil {
		return errors.Errorf("failed to get current TTL for token index: %w", err)
	}

	// Update TTL only if the new token's TTL is longer than the current one
	// -2 means key doesn't exist (first token), -1 means no expiration (shouldn't happen)
	if currentTTL < 0 || ttl > currentTTL {
		if err := r.kvs.Expire(ctx, anonKey, ttl); err != nil {
			return errors.Errorf("failed to set expiration for token index: %w", err)
		}
	}

	return nil
}

// GetRefreshToken retrieves a refresh token by ID.
func (r *AnonRepository) GetRefreshToken(
	ctx context.Context,
	tokenID string,
) (*domainauth.RefreshToken, error) {
	key := r.tokenKey(tokenID)

	dataJSON, err := r.kvs.Get(ctx, key)
	if err != nil {
		if errors.Is(err, domainkvs.ErrNotFound) {
			return nil, errors.Errorf("refresh token not found")
		}

		return nil, errors.Errorf("failed to get refresh token: %w", err)
	}

	var data refreshTokenData
	//nolint:noinlineerr // Inline error handling is clearer here
	if err := json.Unmarshal([]byte(dataJSON), &data); err != nil {
		return nil, errors.Errorf("failed to unmarshal token data: %w", err)
	}

	return &domainauth.RefreshToken{
		ID:         data.ID,
		AnonID:     data.AnonID,
		TokenHash:  data.TokenHash,
		ExpiresAt:  time.Unix(data.ExpiresAt, 0),
		Used:       data.Used,
		UserAgent:  data.UserAgent,
		CreatedAt:  time.Unix(data.CreatedAt, 0),
		LastUsedAt: time.Unix(data.LastUsedAt, 0),
	}, nil
}

// MarkRefreshTokenAsUsed marks a refresh token as used (atomic operation using Lua script).
func (r *AnonRepository) MarkRefreshTokenAsUsed(ctx context.Context, tokenID string) error {
	now := time.Now()
	key := r.tokenKey(tokenID)

	// Lua script to atomically check and mark token as used
	script := `
		local key = KEYS[1]
		local now_unix = tonumber(ARGV[1])

		local value = redis.call('GET', key)
		if not value then
			return {err='token not found'}
		end

		local data = cjson.decode(value)

		if data.Used then
			return {err='token already used'}
		end

		if data.ExpiresAt < now_unix then
			return {err='token expired'}
		end

		data.Used = true
		data.LastUsedAt = now_unix

		local ttl = redis.call('TTL', key)
		if ttl <= 0 then
			return {err='token expired'}
		end

		redis.call('SET', key, cjson.encode(data), 'EX', ttl)
		return {ok='success'}
	`

	result, err := r.kvs.Eval(ctx, script, []string{key}, now.Unix())
	if err != nil {
		return errors.Errorf("failed to mark token as used: %w", err)
	}

	// Parse result
	resultMap, ok := result.(map[interface{}]interface{})
	if !ok {
		return errors.Errorf("unexpected result type from lua script")
	}

	if errMsg, exists := resultMap["err"]; exists {
		return errors.Errorf("%v", errMsg)
	}

	return nil
}

// RevokeRefreshToken deletes a refresh token and removes it from the anon_id index.
func (r *AnonRepository) RevokeRefreshToken(ctx context.Context, tokenID string) error {
	// Get token to find its anon_id
	token, err := r.GetRefreshToken(ctx, tokenID)
	if err != nil {
		// If token doesn't exist, consider it already revoked
		if errors.Is(err, domainkvs.ErrNotFound) {
			return nil
		}

		return err
	}

	// Delete token data
	key := r.tokenKey(tokenID)
	//nolint:noinlineerr // Inline error handling is clearer here
	if err := r.kvs.Delete(ctx, key); err != nil {
		return errors.Errorf("failed to revoke refresh token: %w", err)
	}

	// Remove from anon_id set
	anonKey := r.anonTokensKey(token.AnonID)
	//nolint:nilerr,noinlineerr // Intentionally ignore set removal errors and continue
	if err := r.kvs.SRem(ctx, anonKey, tokenID); err != nil {
		// Log but don't fail if set removal fails
		return nil
	}

	return nil
}

// RevokeAllAnonTokens revokes all refresh tokens for an anon_id.
func (r *AnonRepository) RevokeAllAnonTokens(ctx context.Context, anonID string) error {
	anonKey := r.anonTokensKey(anonID)

	// Get all token IDs for this anon_id
	tokenIDs, err := r.kvs.SMembers(ctx, anonKey)
	if err != nil {
		return errors.Errorf("failed to get anon tokens: %w", err)
	}

	if len(tokenIDs) == 0 {
		return nil // No tokens to revoke
	}

	// Revoke each token
	for _, tokenID := range tokenIDs {
		key := r.tokenKey(tokenID)
		if err := r.kvs.Delete(ctx, key); err != nil {
			// Log but continue with other tokens
			continue
		}
	}

	// Delete the index set
	if err := r.kvs.Delete(ctx, anonKey); err != nil {
		return errors.Errorf("failed to delete anon tokens index: %w", err)
	}

	return nil
}

// tokenKey returns the Redis key for a refresh token.
func (r *AnonRepository) tokenKey(tokenID string) string {
	return "refresh:" + tokenID
}

// anonTokensKey returns the Redis key for the set of tokens for an anon_id.
func (r *AnonRepository) anonTokensKey(anonID string) string {
	return "anon:tokens:" + anonID
}

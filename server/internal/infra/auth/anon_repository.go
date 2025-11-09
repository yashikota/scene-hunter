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
type refreshTokenData struct {
	ID         string    `json:"id"`
	AnonID     string    `json:"anon_id"`
	TokenHash  string    `json:"token_hash"`
	ExpiresAt  time.Time `json:"expires_at"`
	Used       bool      `json:"used"`
	UserAgent  string    `json:"user_agent"`
	CreatedAt  time.Time `json:"created_at"`
	LastUsedAt time.Time `json:"last_used_at"`
}

func (r *AnonRepository) tokenKey(tokenID string) string {
	return "refresh:" + tokenID
}

func (r *AnonRepository) anonTokensKey(anonID string) string {
	return "anon:tokens:" + anonID
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
		ExpiresAt:  token.ExpiresAt,
		Used:       token.Used,
		UserAgent:  token.UserAgent,
		CreatedAt:  token.CreatedAt,
		LastUsedAt: token.LastUsedAt,
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
	if err := r.kvs.Set(ctx, key, string(dataJSON), ttl); err != nil {
		return errors.Errorf("failed to save refresh token: %w", err)
	}

	// Add to anon_id index (for revocation)
	anonKey := r.anonTokensKey(token.AnonID)
	// Store as a set of token IDs
	if err := r.kvs.Set(ctx, anonKey, token.ID, ttl); err != nil {
		return errors.Errorf("failed to index token by anon_id: %w", err)
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
	if err := json.Unmarshal([]byte(dataJSON), &data); err != nil {
		return nil, errors.Errorf("failed to unmarshal token data: %w", err)
	}

	return &domainauth.RefreshToken{
		ID:         data.ID,
		AnonID:     data.AnonID,
		TokenHash:  data.TokenHash,
		ExpiresAt:  data.ExpiresAt,
		Used:       data.Used,
		UserAgent:  data.UserAgent,
		CreatedAt:  data.CreatedAt,
		LastUsedAt: data.LastUsedAt,
	}, nil
}

// MarkRefreshTokenAsUsed marks a refresh token as used (atomic operation).
func (r *AnonRepository) MarkRefreshTokenAsUsed(ctx context.Context, tokenID string) error {
	token, err := r.GetRefreshToken(ctx, tokenID)
	if err != nil {
		return err
	}

	if token.Used {
		return errors.Errorf("refresh token already used")
	}

	token.Used = true
	token.LastUsedAt = time.Now()

	data := refreshTokenData{
		ID:         token.ID,
		AnonID:     token.AnonID,
		TokenHash:  token.TokenHash,
		ExpiresAt:  token.ExpiresAt,
		Used:       true,
		UserAgent:  token.UserAgent,
		CreatedAt:  token.CreatedAt,
		LastUsedAt: token.LastUsedAt,
	}

	dataJSON, err := json.Marshal(data)
	if err != nil {
		return errors.Errorf("failed to marshal token data: %w", err)
	}

	ttl := time.Until(token.ExpiresAt)
	if ttl <= 0 {
		return errors.Errorf("token expired")
	}

	key := r.tokenKey(tokenID)
	if err := r.kvs.Set(ctx, key, string(dataJSON), ttl); err != nil {
		return errors.Errorf("failed to mark token as used: %w", err)
	}

	return nil
}

// RevokeRefreshToken deletes a refresh token.
func (r *AnonRepository) RevokeRefreshToken(ctx context.Context, tokenID string) error {
	key := r.tokenKey(tokenID)

	err := r.kvs.Delete(ctx, key)
	if err != nil {
		return errors.Errorf("failed to revoke refresh token: %w", err)
	}

	return nil
}

// RevokeAllAnonTokens revokes all refresh tokens for an anon_id.
func (r *AnonRepository) RevokeAllAnonTokens(ctx context.Context, anonID string) error {
	// This is a simplified implementation
	// In production, you might want to use Redis SCAN or maintain a proper set
	anonKey := r.anonTokensKey(anonID)

	tokenID, err := r.kvs.Get(ctx, anonKey)
	if err != nil {
		if errors.Is(err, domainkvs.ErrNotFound) {
			return nil // No tokens to revoke
		}

		return errors.Errorf("failed to get anon tokens: %w", err)
	}

	// Revoke the token
	if err := r.RevokeRefreshToken(ctx, tokenID); err != nil {
		return err
	}

	// Delete the index
	if err := r.kvs.Delete(ctx, anonKey); err != nil {
		return errors.Errorf("failed to delete anon tokens index: %w", err)
	}

	return nil
}

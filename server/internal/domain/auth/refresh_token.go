package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"time"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// RefreshToken represents a refresh token with metadata.
type RefreshToken struct {
	ID         string
	AnonID     string
	TokenHash  string
	ExpiresAt  time.Time
	Used       bool
	UserAgent  string
	CreatedAt  time.Time
	LastUsedAt time.Time
}

// NewRefreshToken creates a new refresh token.
// Returns the token metadata and the raw token string (ID:secret) to be sent to the client.
func NewRefreshToken(anonID, userAgent string, ttl time.Duration) (*RefreshToken, string, error) {
	tokenID, err := uuid.NewV7()
	if err != nil {
		return nil, "", errors.Errorf("failed to generate refresh token ID: %w", err)
	}

	// Generate random token secret (32 bytes)
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, "", errors.Errorf("failed to generate random token: %w", err)
	}

	tokenSecret := base64.RawURLEncoding.EncodeToString(tokenBytes)

	// Hash the token secret for storage
	hash := sha256.Sum256([]byte(tokenSecret))
	tokenHash := base64.RawURLEncoding.EncodeToString(hash[:])

	now := time.Now()

	token := &RefreshToken{
		ID:         tokenID.String(),
		AnonID:     anonID,
		TokenHash:  tokenHash,
		ExpiresAt:  now.Add(ttl),
		Used:       false,
		UserAgent:  userAgent,
		CreatedAt:  now,
		LastUsedAt: now,
	}

	// Return token in format: ID:secret
	rawToken := tokenID.String() + ":" + tokenSecret

	return token, rawToken, nil
}

// GetRawToken returns the raw token string (ID:hash for lookup).
// Deprecated: Use the rawToken returned by NewRefreshToken instead.
func (r *RefreshToken) GetRawToken() string {
	return r.ID
}

// HashToken creates a SHA-256 hash of a token string.
func HashToken(token string) string {
	hash := sha256.Sum256([]byte(token))

	return base64.RawURLEncoding.EncodeToString(hash[:])
}

// IsExpired checks if the refresh token is expired.
func (r *RefreshToken) IsExpired() bool {
	return time.Now().After(r.ExpiresAt)
}

// IsValid checks if the refresh token is valid (not expired, not used).
func (r *RefreshToken) IsValid() bool {
	return !r.Used && !r.IsExpired()
}

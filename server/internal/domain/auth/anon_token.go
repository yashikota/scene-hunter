// Package auth provides authentication domain models and logic.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// AnonToken represents an anonymous access token.
type AnonToken struct {
	AnonID    string
	ExpiresAt time.Time
	Token     string
}

// TokenSigner signs and verifies anonymous tokens.
type TokenSigner struct {
	secret []byte
}

// NewTokenSigner creates a new TokenSigner with the given secret.
func NewTokenSigner(secret []byte) *TokenSigner {
	return &TokenSigner{
		secret: secret,
	}
}

// SignAnonToken creates a signed anonymous access token.
func (s *TokenSigner) SignAnonToken(anonID string, ttl time.Duration) (*AnonToken, error) {
	if anonID == "" {
		return nil, errors.Errorf("anon_id cannot be empty")
	}

	expiresAt := time.Now().Add(ttl)
	expUnix := expiresAt.Unix()

	// Format: anonID.expUnix
	payload := fmt.Sprintf("%s.%d", anonID, expUnix)

	// Create HMAC signature
	h := hmac.New(sha256.New, s.secret)
	h.Write([]byte(payload))
	sig := h.Sum(nil)

	// Encode: payload.signature
	token := base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." +
		base64.RawURLEncoding.EncodeToString(sig)

	return &AnonToken{
		AnonID:    anonID,
		ExpiresAt: expiresAt,
		Token:     token,
	}, nil
}

// VerifyAnonToken verifies and decodes an anonymous access token.
func (s *TokenSigner) VerifyAnonToken(token string) (*AnonToken, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.Errorf("invalid token format")
	}

	// Decode payload
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0] + "." + parts[1])
	if err != nil {
		return nil, errors.Errorf("failed to decode payload: %w", err)
	}

	// Decode signature
	sigBytes, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, errors.Errorf("failed to decode signature: %w", err)
	}

	// Verify signature
	h := hmac.New(sha256.New, s.secret)
	h.Write(payloadBytes)
	expectedSig := h.Sum(nil)

	if !hmac.Equal(sigBytes, expectedSig) {
		return nil, errors.Errorf("invalid token signature")
	}

	// Parse payload
	payloadStr := string(payloadBytes)

	payloadParts := strings.Split(payloadStr, ".")
	if len(payloadParts) != 2 {
		return nil, errors.Errorf("invalid payload format")
	}

	anonID := payloadParts[0]

	expUnix, err := strconv.ParseInt(payloadParts[1], 10, 64)
	if err != nil {
		return nil, errors.Errorf("invalid expiration time: %w", err)
	}

	expiresAt := time.Unix(expUnix, 0)

	// Check expiration
	if time.Now().After(expiresAt) {
		return nil, errors.Errorf("token expired")
	}

	return &AnonToken{
		AnonID:    anonID,
		ExpiresAt: expiresAt,
		Token:     token,
	}, nil
}

// GenerateAnonID generates a new unique anonymous ID.
func GenerateAnonID() (string, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return "", errors.Errorf("failed to generate anon_id: %w", err)
	}

	return id.String(), nil
}

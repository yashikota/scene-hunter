package auth

import (
	"time"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// Identity represents a user identity from an OAuth provider.
type Identity struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	Provider  string
	Subject   string
	Email     string
	CreatedAt time.Time
}

// NewIdentity creates a new Identity.
func NewIdentity(userID uuid.UUID, provider, subject, email string) (*Identity, error) {
	identityID, err := uuid.NewV7()
	if err != nil {
		return nil, errors.Errorf("failed to generate identity ID: %w", err)
	}

	if provider == "" {
		return nil, errors.Errorf("provider cannot be empty")
	}

	if subject == "" {
		return nil, errors.Errorf("subject cannot be empty")
	}

	return &Identity{
		ID:        identityID,
		UserID:    userID,
		Provider:  provider,
		Subject:   subject,
		Email:     email,
		CreatedAt: time.Now(),
	}, nil
}

// GoogleIdentity creates a new Identity for Google OAuth.
func GoogleIdentity(userID uuid.UUID, subject, email string) (*Identity, error) {
	return NewIdentity(userID, "google", subject, email)
}

// Package user represents a user domain.
package user

import (
	"time"

	"github.com/google/uuid"
)

// User represents a user.
type User struct {
	ID        uuid.UUID
	Code      string
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt time.Time
}

// NewUser creates a new User with the given code, name, and current time.
func NewUser(code, name string, now time.Time) *User {
	userID, err := uuid.NewV7()
	if err != nil {
		panic(err)
	}

	return &User{
		ID:        userID,
		Code:      code,
		Name:      name,
		CreatedAt: now,
		UpdatedAt: now,
		DeletedAt: time.Time{},
	}
}

package user

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID        uuid.UUID
	Code      string
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt time.Time
}

func NewUser(code, name string) *User {
	id, err := uuid.NewV7()
	if err != nil {
		panic(err)
	}

	return &User{
		ID:        id,
		Code:      code,
		Name:      name,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		DeletedAt: time.Time{},
	}
}

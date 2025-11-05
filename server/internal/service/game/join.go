// Package game represents game service domain.
package game

import (
	"github.com/yashikota/scene-hunter/server/internal/domain/room"
	"github.com/yashikota/scene-hunter/server/internal/domain/user"
)

// JoinService represents a service for joining a game.
type JoinService struct {
	user *user.User
	room *room.Room
}

// NewJoinService creates a new JoinService.
func NewJoinService(u *user.User, r *room.Room) *JoinService {
	return &JoinService{user: u, room: r}
}

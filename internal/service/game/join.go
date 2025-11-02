package game

import (
	"github.com/yashikota/scene-hunter/internal/domain/user"
	"github.com/yashikota/scene-hunter/internal/domain/room"
)

type JoinService struct {
	user *user.User
	room *room.Room
}

func NewJoinService(user *user.User, room *room.Room) *JoinService {
	return &JoinService{user: user, room: room}
}

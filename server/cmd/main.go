package main

import (
	"fmt"

	"github.com/yashikota/scene-hunter/internal/domain/user"
	"github.com/yashikota/scene-hunter/internal/domain/room"
)

func main() {
	user := user.NewUser("user-code", "user-name")
	fmt.Println(user)

	room := room.NewRoom("room-code")
	fmt.Println(room)
}

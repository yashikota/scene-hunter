// Package main is the entry point of the scene-hunter server.
package main

import (
	"log"

	"github.com/yashikota/scene-hunter/server/internal/domain/room"
	"github.com/yashikota/scene-hunter/server/internal/domain/user"
)

func main() {
	u := user.NewUser("user-code", "user-name")
	log.Println(u)

	r := room.NewRoom("room-code")
	log.Println(r)
}

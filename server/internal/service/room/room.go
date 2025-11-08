// Package room represents room service.
package room

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	domainroom "github.com/yashikota/scene-hunter/server/internal/domain/room"
)

const (
	maxRetries     = 10
	roomCodeLength = 6
)

// Service implements the RoomService handler.
type Service struct {
	repo domainroom.Repository
}

// NewService creates a new room service.
func NewService(repo domainroom.Repository) *Service {
	return &Service{
		repo: repo,
	}
}

// generateRoomCode generates a random 6-digit room code.
func generateRoomCode() (string, error) {
	code := ""

	var codeSb36 strings.Builder

	for range roomCodeLength {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", fmt.Errorf("failed to generate random number: %w", err)
		}

		codeSb36.WriteString(n.String())
	}

	code += codeSb36.String()

	return code, nil
}

// CreateRoom creates a new room.
func (s *Service) CreateRoom(
	ctx context.Context,
	req *scene_hunterv1.CreateRoomRequest,
) (*scene_hunterv1.CreateRoomResponse, error) {
	// Generate unique room code with retry logic
	var (
		roomCode string
		room     *domainroom.Room
	)

	for attempt := range maxRetries {
		code, err := generateRoomCode()
		if err != nil {
			return nil, connect.NewError(
				connect.CodeInternal,
				fmt.Errorf("failed to generate room code: %w", err),
			)
		}

		room = domainroom.NewRoom(code)
		roomCode = code

		// Try to create the room
		err = s.repo.Create(ctx, room)
		if err == nil {
			break
		}

		// If it's the last retry, return error
		if attempt == maxRetries-1 {
			return nil, connect.NewError(
				connect.CodeInternal,
				fmt.Errorf("failed to create room after %d retries: %w", maxRetries, err),
			)
		}
	}

	// Convert domain room to proto room
	protoRoom := &scene_hunterv1.Room{
		Id:        room.ID.String(),
		RoomCode:  roomCode,
		ExpiredAt: room.ExpiredAt.Format("2006-01-02T15:04:05Z07:00"),
		CreatedAt: room.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt: room.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}

	return &scene_hunterv1.CreateRoomResponse{
		Room: protoRoom,
	}, nil
}

// GetRoom retrieves a room by ID.
func (s *Service) GetRoom(
	ctx context.Context,
	req *scene_hunterv1.GetRoomRequest,
) (*scene_hunterv1.GetRoomResponse, error) {
	// Parse room ID
	roomID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			fmt.Errorf("invalid room ID: %w", err),
		)
	}

	// Get room from repository
	room, err := s.repo.Get(ctx, roomID)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeNotFound,
			fmt.Errorf("room not found: %w", err),
		)
	}

	// Convert domain room to proto room
	protoRoom := &scene_hunterv1.Room{
		Id:        room.ID.String(),
		RoomCode:  room.Code,
		ExpiredAt: room.ExpiredAt.Format("2006-01-02T15:04:05Z07:00"),
		CreatedAt: room.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt: room.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}

	return &scene_hunterv1.GetRoomResponse{
		Room: protoRoom,
	}, nil
}

// UpdateRoom updates an existing room.
func (s *Service) UpdateRoom(
	ctx context.Context,
	req *scene_hunterv1.UpdateRoomRequest,
) (*scene_hunterv1.UpdateRoomResponse, error) {
	protoRoom := req.GetRoom()
	if protoRoom == nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			domainroom.ErrRoomRequired,
		)
	}

	// Parse room ID
	roomID, err := uuid.Parse(protoRoom.GetId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			fmt.Errorf("invalid room ID: %w", err),
		)
	}

	// Get existing room
	room, err := s.repo.Get(ctx, roomID)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeNotFound,
			fmt.Errorf("room not found: %w", err),
		)
	}

	// Update room code if provided
	if protoRoom.GetRoomCode() != "" {
		room.Code = protoRoom.GetRoomCode()
	}

	// Update room in repository
	err = s.repo.Update(ctx, room)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			fmt.Errorf("failed to update room: %w", err),
		)
	}

	// Convert domain room to proto room
	updatedProtoRoom := &scene_hunterv1.Room{
		Id:        room.ID.String(),
		RoomCode:  room.Code,
		ExpiredAt: room.ExpiredAt.Format("2006-01-02T15:04:05Z07:00"),
		CreatedAt: room.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt: room.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}

	return &scene_hunterv1.UpdateRoomResponse{
		Room: updatedProtoRoom,
	}, nil
}

// DeleteRoom deletes a room.
func (s *Service) DeleteRoom(
	ctx context.Context,
	req *scene_hunterv1.DeleteRoomRequest,
) (*scene_hunterv1.DeleteRoomResponse, error) {
	// Parse room ID
	roomID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			fmt.Errorf("invalid room ID: %w", err),
		)
	}

	// Get room before deletion (for response)
	room, err := s.repo.Get(ctx, roomID)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeNotFound,
			fmt.Errorf("room not found: %w", err),
		)
	}

	// Delete room from repository
	err = s.repo.Delete(ctx, roomID)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			fmt.Errorf("failed to delete room: %w", err),
		)
	}

	// Convert domain room to proto room
	protoRoom := &scene_hunterv1.Room{
		Id:        room.ID.String(),
		RoomCode:  room.Code,
		ExpiredAt: room.ExpiredAt.Format("2006-01-02T15:04:05Z07:00"),
		CreatedAt: room.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt: room.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}

	return &scene_hunterv1.DeleteRoomResponse{
		Room: protoRoom,
	}, nil
}

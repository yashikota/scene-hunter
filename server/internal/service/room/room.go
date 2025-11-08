// Package room represents room service.
package room

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
	"time"

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
	var codeSb strings.Builder
	codeSb.Grow(roomCodeLength)

	for range roomCodeLength {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", fmt.Errorf("failed to generate random number: %w", err)
		}

		codeSb.WriteString(n.String())
	}

	return codeSb.String(), nil
}

// toProtoRoom converts domain room to proto room.
func toProtoRoom(room *domainroom.Room) *scene_hunterv1.Room {
	return &scene_hunterv1.Room{
		Id:        room.ID.String(),
		RoomCode:  room.Code,
		ExpiredAt: room.ExpiredAt.Format(time.RFC3339),
		CreatedAt: room.CreatedAt.Format(time.RFC3339),
		UpdatedAt: room.UpdatedAt.Format(time.RFC3339),
	}
}

// CreateRoom creates a new room.
func (s *Service) CreateRoom(
	ctx context.Context,
	req *scene_hunterv1.CreateRoomRequest,
) (*scene_hunterv1.CreateRoomResponse, error) {
	// Generate unique room code with retry logic
	var room *domainroom.Room

	for attempt := range maxRetries {
		code, err := generateRoomCode()
		if err != nil {
			return nil, connect.NewError(
				connect.CodeInternal,
				fmt.Errorf("failed to generate room code: %w", err),
			)
		}

		room = domainroom.NewRoom(code)

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

	return &scene_hunterv1.CreateRoomResponse{
		Room: toProtoRoom(room),
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

	return &scene_hunterv1.GetRoomResponse{
		Room: toProtoRoom(room),
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

	return &scene_hunterv1.UpdateRoomResponse{
		Room: toProtoRoom(room),
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

	return &scene_hunterv1.DeleteRoomResponse{
		Room: toProtoRoom(room),
	}, nil
}

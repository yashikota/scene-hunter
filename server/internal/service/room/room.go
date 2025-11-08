package room

import (
	"context"
	"crypto/rand"
	"math/big"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	domainchrono "github.com/yashikota/scene-hunter/server/internal/domain/chrono"
	domainroom "github.com/yashikota/scene-hunter/server/internal/domain/room"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

const (
	maxRetries     = 10
	roomCodeLength = 6
)

type Service struct {
	repo   domainroom.Repository
	chrono domainchrono.Chrono
}

func NewService(repo domainroom.Repository, chrono domainchrono.Chrono) *Service {
	return &Service{
		repo:   repo,
		chrono: chrono,
	}
}

func generateRoomCode() (string, error) {
	var codeSb strings.Builder

	codeSb.Grow(roomCodeLength)

	for range roomCodeLength {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", errors.Errorf("failed to generate random number: %w", err)
		}

		codeSb.WriteString(n.String())
	}

	return codeSb.String(), nil
}

func toProtoRoom(room *domainroom.Room) *scene_hunterv1.Room {
	return &scene_hunterv1.Room{
		Id:        room.ID.String(),
		RoomCode:  room.Code,
		ExpiredAt: room.ExpiredAt.Format(time.RFC3339),
		CreatedAt: room.CreatedAt.Format(time.RFC3339),
		UpdatedAt: room.UpdatedAt.Format(time.RFC3339),
	}
}

func (s *Service) CreateRoom(
	ctx context.Context,
	req *scene_hunterv1.CreateRoomRequest,
) (*scene_hunterv1.CreateRoomResponse, error) {
	var room *domainroom.Room

	for attempt := range maxRetries {
		code, err := generateRoomCode()
		if err != nil {
			return nil, connect.NewError(
				connect.CodeInternal,
				errors.Errorf("failed to generate room code: %w", err),
			)
		}

		room = domainroom.NewRoom(code, s.chrono.Now())

		err = s.repo.Create(ctx, room)
		if err == nil {
			break
		}

		if attempt == maxRetries-1 {
			return nil, connect.NewError(
				connect.CodeInternal,
				errors.Errorf("failed to create room after %d retries: %w", maxRetries, err),
			)
		}
	}

	return &scene_hunterv1.CreateRoomResponse{
		Room: toProtoRoom(room),
	}, nil
}

func (s *Service) GetRoom(
	ctx context.Context,
	req *scene_hunterv1.GetRoomRequest,
) (*scene_hunterv1.GetRoomResponse, error) {
	roomID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.Errorf("invalid room ID: %w", err),
		)
	}

	room, err := s.repo.Get(ctx, roomID)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeNotFound,
			errors.Errorf("room not found: %w", err),
		)
	}

	return &scene_hunterv1.GetRoomResponse{
		Room: toProtoRoom(room),
	}, nil
}

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

	roomID, err := uuid.Parse(protoRoom.GetId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.Errorf("invalid room ID: %w", err),
		)
	}

	room, err := s.repo.Get(ctx, roomID)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeNotFound,
			errors.Errorf("room not found: %w", err),
		)
	}

	if protoRoom.GetRoomCode() != "" {
		room.Code = protoRoom.GetRoomCode()
	}

	if protoRoom.GetExpiredAt() != "" {
		expiredAt, err := time.Parse(time.RFC3339, protoRoom.GetExpiredAt())
		if err != nil {
			return nil, connect.NewError(
				connect.CodeInvalidArgument,
				errors.Errorf("invalid expired_at format: %w", err),
			)
		}

		room.ExpiredAt = expiredAt
	}

	err = s.repo.Update(ctx, room)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			errors.Errorf("failed to update room: %w", err),
		)
	}

	return &scene_hunterv1.UpdateRoomResponse{
		Room: toProtoRoom(room),
	}, nil
}

func (s *Service) DeleteRoom(
	ctx context.Context,
	req *scene_hunterv1.DeleteRoomRequest,
) (*scene_hunterv1.DeleteRoomResponse, error) {
	roomID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.Errorf("invalid room ID: %w", err),
		)
	}

	room, err := s.repo.Get(ctx, roomID)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeNotFound,
			errors.Errorf("room not found: %w", err),
		)
	}

	err = s.repo.Delete(ctx, roomID)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			errors.Errorf("failed to delete room: %w", err),
		)
	}

	return &scene_hunterv1.DeleteRoomResponse{
		Room: toProtoRoom(room),
	}, nil
}

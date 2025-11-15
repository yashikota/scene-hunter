package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/domain/room"
	"github.com/yashikota/scene-hunter/server/internal/infra/kvs"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// roomRepositoryImpl implements RoomRepository interface using KVS.
type roomRepositoryImpl struct {
	kvs kvs.KVS
}

// NewRoomRepository creates a new room repository.
func NewRoomRepository(kvsClient kvs.KVS) RoomRepository {
	return &roomRepositoryImpl{
		kvs: kvsClient,
	}
}

// roomKey generates the KVS key for a room ID.
func roomKey(id uuid.UUID) string {
	return "room:" + id.String()
}

// roomCodeKey generates the KVS key for a room code.
func roomCodeKey(code string) string {
	return "room_code:" + code
}

// Create saves a new room to KVS.
func (r *roomRepositoryImpl) Create(ctx context.Context, gameRoom *room.Room) error {
	// Calculate TTL from expiration time
	ttl := time.Until(gameRoom.ExpiredAt)
	if ttl <= 0 {
		return room.ErrRoomExpired
	}

	// Serialize room to JSON
	data, err := json.Marshal(gameRoom)
	if err != nil {
		return errors.Errorf("failed to marshal room: %w", err)
	}

	// First, try to reserve the room code
	codeKey := roomCodeKey(gameRoom.Code)

	codeSet, err := r.kvs.SetNX(ctx, codeKey, gameRoom.ID.String(), ttl)
	if err != nil {
		return errors.Errorf("failed to reserve room code: %w", err)
	}

	if !codeSet {
		return errors.Errorf("%w: code=%s", room.ErrRoomAlreadyExists, gameRoom.Code)
	}

	// Then, save the room data atomically
	roomKey := roomKey(gameRoom.ID)

	roomSet, err := r.kvs.SetNX(ctx, roomKey, string(data), ttl)
	if err != nil {
		// Clean up the room code reservation
		_ = r.kvs.Delete(ctx, codeKey)

		return errors.Errorf("failed to save room to KVS: %w", err)
	}

	if !roomSet {
		// Clean up the room code reservation
		_ = r.kvs.Delete(ctx, codeKey)

		return errors.Errorf("%w: id=%s", room.ErrRoomAlreadyExists, gameRoom.ID)
	}

	return nil
}

// Get retrieves a room from KVS by ID.
func (r *roomRepositoryImpl) Get(ctx context.Context, roomID uuid.UUID) (*room.Room, error) {
	key := roomKey(roomID)

	data, err := r.kvs.Get(ctx, key)
	if err != nil {
		if errors.Is(err, kvs.ErrNotFound) {
			return nil, errors.Errorf("%w: id=%s", room.ErrRoomNotFound, roomID)
		}

		return nil, errors.Errorf("failed to get room from KVS: %w", err)
	}

	var gameRoom room.Room

	err = json.Unmarshal([]byte(data), &gameRoom)
	if err != nil {
		return nil, errors.Errorf("failed to unmarshal room: %w", err)
	}

	return &gameRoom, nil
}

// Update updates an existing room in KVS.
// Note: There is a potential race condition between Exists check and Set operation.
// However, since updates are typically initiated by a single user/session and
// the likelihood of concurrent updates is low, this approach is acceptable.
func (r *roomRepositoryImpl) Update(ctx context.Context, gameRoom *room.Room) error {
	// Check if room exists
	_, err := r.Get(ctx, gameRoom.ID)
	if err != nil {
		return err
	}

	// Update timestamp
	gameRoom.UpdatedAt = time.Now()

	// Serialize room to JSON
	data, err := json.Marshal(gameRoom)
	if err != nil {
		return errors.Errorf("failed to marshal room: %w", err)
	}

	// Calculate TTL from expiration time
	ttl := time.Until(gameRoom.ExpiredAt)
	if ttl <= 0 {
		return room.ErrRoomExpired
	}

	// Save to KVS with TTL (overwrites existing key)
	key := roomKey(gameRoom.ID)

	err = r.kvs.Set(ctx, key, string(data), ttl)
	if err != nil {
		return errors.Errorf("failed to update room in KVS: %w", err)
	}

	return nil
}

// Delete removes a room from KVS.
func (r *roomRepositoryImpl) Delete(ctx context.Context, roomID uuid.UUID) error {
	// Get room first to retrieve the room code
	gameRoom, err := r.Get(ctx, roomID)
	if err != nil {
		return err
	}

	// Delete room data
	roomKey := roomKey(roomID)

	err = r.kvs.Delete(ctx, roomKey)
	if err != nil {
		return errors.Errorf("failed to delete room from KVS: %w", err)
	}

	// Delete room code mapping (ignore error since room data is already deleted)
	codeKey := roomCodeKey(gameRoom.Code)
	_ = r.kvs.Delete(ctx, codeKey)

	return nil
}

// Exists checks if a room exists in KVS.
func (r *roomRepositoryImpl) Exists(ctx context.Context, roomID uuid.UUID) (bool, error) {
	key := roomKey(roomID)

	exists, err := r.kvs.Exists(ctx, key)
	if err != nil {
		return false, errors.Errorf("failed to check room existence in KVS: %w", err)
	}

	return exists, nil
}

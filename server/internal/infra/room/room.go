// Package room provides room repository implementations.
package room

import (
	"context"
	"encoding/json"
	stderrors "errors"
	"time"

	"github.com/google/uuid"
	domainkvs "github.com/yashikota/scene-hunter/server/internal/domain/kvs"
	domainroom "github.com/yashikota/scene-hunter/server/internal/domain/room"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// Repository implements the room repository using KVS.
type Repository struct {
	kvs domainkvs.KVS
}

// NewRepository creates a new room repository.
func NewRepository(kvs domainkvs.KVS) domainroom.Repository {
	return &Repository{
		kvs: kvs,
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
func (r *Repository) Create(ctx context.Context, room *domainroom.Room) error {
	// Calculate TTL from expiration time
	ttl := time.Until(room.ExpiredAt)
	if ttl <= 0 {
		return domainroom.ErrRoomExpired
	}

	// Serialize room to JSON
	data, err := json.Marshal(room)
	if err != nil {
		return errors.Errorf("failed to marshal room: %w", err)
	}

	// First, try to reserve the room code
	codeKey := roomCodeKey(room.Code)

	codeSet, err := r.kvs.SetNX(ctx, codeKey, room.ID.String(), ttl)
	if err != nil {
		return errors.Errorf("failed to reserve room code: %w", err)
	}

	if !codeSet {
		return errors.Errorf("%w: code=%s", domainroom.ErrRoomAlreadyExists, room.Code)
	}

	// Then, save the room data atomically
	roomKey := roomKey(room.ID)

	roomSet, err := r.kvs.SetNX(ctx, roomKey, string(data), ttl)
	if err != nil {
		// Clean up the room code reservation
		_ = r.kvs.Delete(ctx, codeKey)

		return errors.Errorf("failed to save room to KVS: %w", err)
	}

	if !roomSet {
		// Clean up the room code reservation
		_ = r.kvs.Delete(ctx, codeKey)

		return errors.Errorf("%w: id=%s", domainroom.ErrRoomAlreadyExists, room.ID)
	}

	if !roomSet {
		// Clean up the room code reservation (ignore error)
		_ = r.kvs.Delete(ctx, codeKey)

		return fmt.Errorf("%w: id=%s", domainroom.ErrRoomAlreadyExists, room.ID)
	}

	return nil
}

// Get retrieves a room from KVS by ID.
func (r *Repository) Get(ctx context.Context, roomID uuid.UUID) (*domainroom.Room, error) {
	key := roomKey(roomID)

	data, err := r.kvs.Get(ctx, key)
	if err != nil {
		if stderrors.Is(err, domainkvs.ErrNotFound) {
			return nil, errors.Errorf("%w: id=%s", domainroom.ErrRoomNotFound, roomID)
		}

		return nil, errors.Errorf("failed to get room from KVS: %w", err)
	}

	var room domainroom.Room

	err = json.Unmarshal([]byte(data), &room)
	if err != nil {
		return nil, errors.Errorf("failed to unmarshal room: %w", err)
	}

	return &room, nil
}

// Update updates an existing room in KVS.
// Note: There is a potential race condition between Exists check and Set operation.
// However, since updates are typically initiated by a single user/session and
// the likelihood of concurrent updates is low, this approach is acceptable.
func (r *Repository) Update(ctx context.Context, room *domainroom.Room) error {
	// Get current room to check if code has changed
	currentRoom, err := r.Get(ctx, room.ID)
	if err != nil {
		return errors.Errorf("failed to check room existence: %w", err)
	}

	if !exists {
		return errors.Errorf("%w: id=%s", domainroom.ErrRoomNotFound, room.ID)
	}

	// Update timestamp
	room.UpdatedAt = time.Now()

	// Serialize room to JSON
	data, err := json.Marshal(room)
	if err != nil {
		return errors.Errorf("failed to marshal room: %w", err)
	}

	// Calculate TTL from expiration time
	ttl := time.Until(room.ExpiredAt)
	if ttl <= 0 {
		return domainroom.ErrRoomExpired
	}

	// Save to KVS with TTL (overwrites existing key)
	key := roomKey(room.ID)

	err = r.kvs.Set(ctx, key, string(data), ttl)
	if err != nil {
		return errors.Errorf("failed to update room in KVS: %w", err)
	}

	return nil
}

// Delete removes a room from KVS.
func (r *Repository) Delete(ctx context.Context, roomID uuid.UUID) error {
	// Get room first to retrieve the room code
	room, err := r.Get(ctx, roomID)
	if err != nil {
		return err
	}

	// Delete room data
	roomKey := roomKey(roomID)

	err = r.kvs.Delete(ctx, roomKey)
	if err != nil {
		return errors.Errorf("failed to delete room from KVS: %w", err)
	}

	// Delete room code mapping
	codeKey := roomCodeKey(room.Code)

	err = r.kvs.Delete(ctx, codeKey)
	if err != nil {
		// Log error but don't fail the operation
		// The room data has already been deleted
		return errors.Errorf("failed to delete room code from KVS: %w", err)
	}

	// Delete room code mapping (ignore error since room data is already deleted)
	codeKey := roomCodeKey(room.Code)
	_ = r.kvs.Delete(ctx, codeKey)

	return nil
}

// Exists checks if a room exists in KVS.
func (r *Repository) Exists(ctx context.Context, roomID uuid.UUID) (bool, error) {
	key := roomKey(roomID)

	exists, err := r.kvs.Exists(ctx, key)
	if err != nil {
		return false, errors.Errorf("failed to check room existence in KVS: %w", err)
	}

	return exists, nil
}

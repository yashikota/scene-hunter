// Package room provides room repository implementations.
package room

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	domainkvs "github.com/yashikota/scene-hunter/server/internal/domain/kvs"
	domainroom "github.com/yashikota/scene-hunter/server/internal/domain/room"
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

// Create saves a new room to KVS.
func (r *Repository) Create(ctx context.Context, room *domainroom.Room) error {
	// Check if room already exists
	exists, err := r.Exists(ctx, room.ID)
	if err != nil {
		return fmt.Errorf("failed to check room existence: %w", err)
	}

	if exists {
		return fmt.Errorf("%w: %s", domainroom.ErrRoomAlreadyExists, room.ID)
	}

	// Serialize room to JSON
	data, err := json.Marshal(room)
	if err != nil {
		return fmt.Errorf("failed to marshal room: %w", err)
	}

	// Calculate TTL from expiration time
	ttl := time.Until(room.ExpiredAt)
	if ttl <= 0 {
		return domainroom.ErrRoomExpired
	}

	// Save to KVS with TTL
	key := roomKey(room.ID)

	err = r.kvs.Set(ctx, key, string(data), ttl)
	if err != nil {
		return fmt.Errorf("failed to save room to KVS: %w", err)
	}

	return nil
}

// Get retrieves a room from KVS by ID.
func (r *Repository) Get(ctx context.Context, id uuid.UUID) (*domainroom.Room, error) {
	key := roomKey(id)

	data, err := r.kvs.Get(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("failed to get room from KVS: %w", err)
	}

	var room domainroom.Room

	err = json.Unmarshal([]byte(data), &room)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal room: %w", err)
	}

	return &room, nil
}

// Update updates an existing room in KVS.
func (r *Repository) Update(ctx context.Context, room *domainroom.Room) error {
	// Check if room exists
	exists, err := r.Exists(ctx, room.ID)
	if err != nil {
		return fmt.Errorf("failed to check room existence: %w", err)
	}

	if !exists {
		return fmt.Errorf("%w: %s", domainroom.ErrRoomNotFound, room.ID)
	}

	// Update timestamp
	room.UpdatedAt = time.Now()

	// Serialize room to JSON
	data, err := json.Marshal(room)
	if err != nil {
		return fmt.Errorf("failed to marshal room: %w", err)
	}

	// Calculate TTL from expiration time
	ttl := time.Until(room.ExpiredAt)
	if ttl <= 0 {
		return domainroom.ErrRoomExpired
	}

	// Save to KVS with TTL
	key := roomKey(room.ID)

	err = r.kvs.Set(ctx, key, string(data), ttl)
	if err != nil {
		return fmt.Errorf("failed to update room in KVS: %w", err)
	}

	return nil
}

// Delete removes a room from KVS.
func (r *Repository) Delete(ctx context.Context, id uuid.UUID) error {
	key := roomKey(id)

	err := r.kvs.Delete(ctx, key)
	if err != nil {
		return fmt.Errorf("failed to delete room from KVS: %w", err)
	}

	return nil
}

// Exists checks if a room exists in KVS.
func (r *Repository) Exists(ctx context.Context, id uuid.UUID) (bool, error) {
	key := roomKey(id)

	exists, err := r.kvs.Exists(ctx, key)
	if err != nil {
		return false, fmt.Errorf("failed to check room existence in KVS: %w", err)
	}

	return exists, nil
}

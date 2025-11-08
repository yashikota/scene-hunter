package room

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	domainchrono "github.com/yashikota/scene-hunter/server/internal/domain/chrono"
	domainkvs "github.com/yashikota/scene-hunter/server/internal/domain/kvs"
	domainroom "github.com/yashikota/scene-hunter/server/internal/domain/room"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

type Repository struct {
	kvs    domainkvs.KVS
	chrono domainchrono.Chrono
}

func NewRepository(kvs domainkvs.KVS, chrono domainchrono.Chrono) domainroom.Repository {
	return &Repository{
		kvs:    kvs,
		chrono: chrono,
	}
}

func roomKey(id uuid.UUID) string {
	return "room:" + id.String()
}

func roomCodeKey(code string) string {
	return "room_code:" + code
}

func (r *Repository) Create(ctx context.Context, room *domainroom.Room) error {
	ttl := time.Until(room.ExpiredAt)
	if ttl <= 0 {
		return domainroom.ErrRoomExpired
	}

	data, err := json.Marshal(room)
	if err != nil {
		return errors.Errorf("failed to marshal room: %w", err)
	}

	codeKey := roomCodeKey(room.Code)

	codeSet, err := r.kvs.SetNX(ctx, codeKey, room.ID.String(), ttl)
	if err != nil {
		return errors.Errorf("failed to reserve room code: %w", err)
	}

	if !codeSet {
		return errors.Errorf("%w: code=%s", domainroom.ErrRoomAlreadyExists, room.Code)
	}

	roomKey := roomKey(room.ID)

	roomSet, err := r.kvs.SetNX(ctx, roomKey, string(data), ttl)
	if err != nil {
		_ = r.kvs.Delete(ctx, codeKey)

		return errors.Errorf("failed to save room to KVS: %w", err)
	}

	if !roomSet {
		_ = r.kvs.Delete(ctx, codeKey)

		return errors.Errorf("%w: id=%s", domainroom.ErrRoomAlreadyExists, room.ID)
	}

	return nil
}

func (r *Repository) Get(ctx context.Context, roomID uuid.UUID) (*domainroom.Room, error) {
	key := roomKey(roomID)

	data, err := r.kvs.Get(ctx, key)
	if err != nil {
		if errors.Is(err, domainkvs.ErrNotFound) {
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

func (r *Repository) Update(ctx context.Context, room *domainroom.Room) error {
	_, err := r.Get(ctx, room.ID)
	if err != nil {
		return err
	}

	room.UpdatedAt = r.chrono.Now()

	data, err := json.Marshal(room)
	if err != nil {
		return errors.Errorf("failed to marshal room: %w", err)
	}

	ttl := time.Until(room.ExpiredAt)
	if ttl <= 0 {
		return domainroom.ErrRoomExpired
	}

	key := roomKey(room.ID)

	err = r.kvs.Set(ctx, key, string(data), ttl)
	if err != nil {
		return errors.Errorf("failed to update room in KVS: %w", err)
	}

	return nil
}

func (r *Repository) Delete(ctx context.Context, roomID uuid.UUID) error {
	room, err := r.Get(ctx, roomID)
	if err != nil {
		return err
	}

	roomKey := roomKey(roomID)

	err = r.kvs.Delete(ctx, roomKey)
	if err != nil {
		return errors.Errorf("failed to delete room from KVS: %w", err)
	}

	codeKey := roomCodeKey(room.Code)
	_ = r.kvs.Delete(ctx, codeKey)

	return nil
}

func (r *Repository) Exists(ctx context.Context, roomID uuid.UUID) (bool, error) {
	key := roomKey(roomID)

	exists, err := r.kvs.Exists(ctx, key)
	if err != nil {
		return false, errors.Errorf("failed to check room existence in KVS: %w", err)
	}

	return exists, nil
}

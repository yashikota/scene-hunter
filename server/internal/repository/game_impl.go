package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/domain/game"
	"github.com/yashikota/scene-hunter/server/internal/infra/kvs"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

var (
	// ErrGameNotFound is returned when a game is not found.
	ErrGameNotFound = errors.New("game not found")
	// ErrGameAlreadyExists is returned when a game already exists.
	ErrGameAlreadyExists = errors.New("game already exists")
	// ErrGameExpired is returned when a game has expired.
	ErrGameExpired = errors.New("game already expired")
)

const (
	// gameTTL is the time-to-live for game data in KVS (24 hours).
	gameTTL = 24 * time.Hour
)

// gameRepositoryImpl implements GameRepository interface using KVS.
type gameRepositoryImpl struct {
	kvs kvs.KVS
}

// NewGameRepository creates a new game repository.
func NewGameRepository(kvsClient kvs.KVS) GameRepository {
	return &gameRepositoryImpl{
		kvs: kvsClient,
	}
}

// gameKey generates the KVS key for a game by room ID.
func gameKey(roomID uuid.UUID) string {
	return "game:" + roomID.String()
}

// Create saves a new game to KVS.
func (r *gameRepositoryImpl) Create(ctx context.Context, gameSession *game.Game) error {
	// Serialize game to JSON
	data, err := json.Marshal(gameSession)
	if err != nil {
		return errors.Errorf("failed to marshal game: %w", err)
	}

	// Save to KVS with TTL
	key := gameKey(gameSession.RoomID)

	set, err := r.kvs.SetNX(ctx, key, string(data), gameTTL)
	if err != nil {
		return errors.Errorf("failed to save game to KVS: %w", err)
	}

	if !set {
		return errors.Errorf("%w: roomID=%s", ErrGameAlreadyExists, gameSession.RoomID)
	}

	return nil
}

// Get retrieves a game from KVS by room ID.
func (r *gameRepositoryImpl) Get(ctx context.Context, roomID uuid.UUID) (*game.Game, error) {
	key := gameKey(roomID)

	data, err := r.kvs.Get(ctx, key)
	if err != nil {
		if errors.Is(err, kvs.ErrNotFound) {
			return nil, errors.Errorf("%w: roomID=%s", ErrGameNotFound, roomID)
		}

		return nil, errors.Errorf("failed to get game from KVS: %w", err)
	}

	var gameSession game.Game

	err = json.Unmarshal([]byte(data), &gameSession)
	if err != nil {
		return nil, errors.Errorf("failed to unmarshal game: %w", err)
	}

	return &gameSession, nil
}

// Update updates an existing game in KVS.
func (r *gameRepositoryImpl) Update(ctx context.Context, gameSession *game.Game) error {
	// Check if game exists
	_, err := r.Get(ctx, gameSession.RoomID)
	if err != nil {
		return err
	}

	// Update timestamp
	gameSession.UpdatedAt = time.Now()

	// Serialize game to JSON
	data, err := json.Marshal(gameSession)
	if err != nil {
		return errors.Errorf("failed to marshal game: %w", err)
	}

	// Save to KVS with TTL (overwrites existing key)
	key := gameKey(gameSession.RoomID)

	err = r.kvs.Set(ctx, key, string(data), gameTTL)
	if err != nil {
		return errors.Errorf("failed to update game in KVS: %w", err)
	}

	return nil
}

// Delete removes a game from KVS.
func (r *gameRepositoryImpl) Delete(ctx context.Context, roomID uuid.UUID) error {
	// Check if game exists
	_, err := r.Get(ctx, roomID)
	if err != nil {
		return err
	}

	// Delete game data
	key := gameKey(roomID)

	err = r.kvs.Delete(ctx, key)
	if err != nil {
		return errors.Errorf("failed to delete game from KVS: %w", err)
	}

	return nil
}

// Exists checks if a game exists in KVS.
func (r *gameRepositoryImpl) Exists(ctx context.Context, roomID uuid.UUID) (bool, error) {
	key := gameKey(roomID)

	exists, err := r.kvs.Exists(ctx, key)
	if err != nil {
		return false, errors.Errorf("failed to check game existence in KVS: %w", err)
	}

	return exists, nil
}

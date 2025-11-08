// Package kvs provides KVS domain interfaces.
package kvs

import (
	"context"
	"errors"
	"time"
)

// ErrNotFound is returned when a key is not found.
var ErrNotFound = errors.New("key not found")

type KVS interface {
	Ping(ctx context.Context) error
	Close()
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, value string, ttl time.Duration) error
	SetNX(ctx context.Context, key string, value string, ttl time.Duration) (bool, error)
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
}

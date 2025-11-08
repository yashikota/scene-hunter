// Package kvs provides KVS domain interfaces.
package kvs

import (
	"context"
	"time"
)

type KVS interface {
	Ping(ctx context.Context) error
	Close()
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, value string, ttl time.Duration) error
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
}

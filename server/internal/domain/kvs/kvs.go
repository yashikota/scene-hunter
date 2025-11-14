// Package kvs provides KVS domain interfaces.
package kvs

import (
	"context"
	"time"

	"github.com/yashikota/scene-hunter/server/internal/util/errors"
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
	Eval(ctx context.Context, script string, keys []string, args ...interface{}) (interface{}, error)
	SAdd(ctx context.Context, key string, members ...string) error
	SMembers(ctx context.Context, key string) ([]string, error)
	SRem(ctx context.Context, key string, members ...string) error
	Expire(ctx context.Context, key string, ttl time.Duration) error
	TTL(ctx context.Context, key string) (time.Duration, error)
}

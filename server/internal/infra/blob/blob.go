package blob

import (
	"context"
	"io"
	"time"
)

type ObjectInfo struct {
	Key          string
	Size         int64
	LastModified time.Time
}

type Blob interface {
	Ping(ctx context.Context) error
	Put(ctx context.Context, key string, data io.Reader, ttl time.Duration) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
	List(ctx context.Context, prefix string) ([]ObjectInfo, error)
}

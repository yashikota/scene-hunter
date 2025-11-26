package service

import (
	"context"
	"io"
	"time"
)

// Blob defines the interface for blob storage operations.
type Blob interface {
	Ping(ctx context.Context) error
	Put(ctx context.Context, key string, data io.Reader, ttl time.Duration) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
	List(ctx context.Context, prefix string) ([]ObjectInfo, error)
}

// ObjectInfo represents metadata about a blob object.
type ObjectInfo struct {
	Key          string
	Size         int64
	LastModified time.Time
}

// KVS defines the interface for key-value store operations.
type KVS interface {
	Ping(ctx context.Context) error
	Close()
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, value string, ttl time.Duration) error
	SetNX(ctx context.Context, key string, value string, ttl time.Duration) (bool, error)
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
	Eval(ctx context.Context, script string, keys []string, args ...any) (any, error)
	SAdd(ctx context.Context, key string, members ...string) error
	SMembers(ctx context.Context, key string) ([]string, error)
	SRem(ctx context.Context, key string, members ...string) error
	Expire(ctx context.Context, key string, ttl time.Duration) error
	TTL(ctx context.Context, key string) (time.Duration, error)
}

// Gemini defines the interface for AI image analysis operations.
type Gemini interface {
	AnalyzeImage(
		ctx context.Context,
		imageData []byte,
		mimeType string,
		prompt string,
	) (*ImageAnalysisResult, error)
}

// ImageAnalysisResult represents the result of image analysis.
type ImageAnalysisResult struct {
	Features []string
}

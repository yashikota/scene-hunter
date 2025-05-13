package storage

import (
	"context"
	"io"
	"time"
)

// ImageInfo は画像の情報を表す
type ImageInfo struct {
	ID        string
	Filename  string
	Size      int64
	Format    string
	Width     int
	Height    int
	Metadata  map[string]interface{}
	CreatedAt time.Time
}

// Storage はストレージ操作のインターフェース
type Storage interface {
	// Upload は画像をアップロードする
	// isPermanent: trueの場合は永続バケット、falseの場合は一時バケットを使用
	// customBucket: 指定された場合は、そのバケットを使用（存在しない場合は作成）
	Upload(ctx context.Context, id string, filename string, reader io.Reader, metadata map[string]interface{}, isPermanent bool, customBucket string) (*ImageInfo, error)

	// Get は画像を取得する
	Get(ctx context.Context, id string) (io.ReadCloser, *ImageInfo, error)

	// GetInfo は画像の情報を取得する
	GetInfo(ctx context.Context, id string) (*ImageInfo, error)

	// Delete は画像を削除する
	Delete(ctx context.Context, id string) error

	// List は画像の一覧を取得する
	List(ctx context.Context, limit int, offset int, sortBy string) ([]*ImageInfo, int, error)

	// Close はストレージ接続を閉じる
	Close() error
}

// Config はストレージの設定を表す
type Config struct {
	Endpoint        string
	AccessKey       string
	SecretKey       string
	UseSSL          bool
	TemporaryBucket string
	PermanentBucket string
	AccountID       string
	Region          string // リージョン（デフォルト: "auto"）
	StorageType     string // "minio" または "r2"
}

// NewStorage はストレージタイプに基づいて適切なストレージを作成する
func NewStorage(cfg *Config) (Storage, error) {
	return NewS3Storage(cfg)
}

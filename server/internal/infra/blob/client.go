// Package blob provides blob storage client implementations.
package blob

import (
	"context"
	"io"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/yashikota/scene-hunter/server/internal/service"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

type Client struct {
	client     *minio.Client
	bucketName string
}

// NewClient creates a new Client with the specified endpoint and credentials.
func NewClient(
	endpoint string,
	accessKey string,
	secretKey string,
	bucketName string,
	useSSL bool,
) (service.Blob, error) {
	minioClient, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, errors.Errorf("failed to create minio client: %w", err)
	}

	return &Client{
		client:     minioClient,
		bucketName: bucketName,
	}, nil
}

func (c *Client) Ping(ctx context.Context) error {
	// Check if bucket exists to verify connection
	exists, err := c.client.BucketExists(ctx, c.bucketName)
	if err != nil {
		return errors.Errorf("failed to check bucket: %w", err)
	}

	if !exists {
		// Create bucket if it doesn't exist
		err = c.client.MakeBucket(ctx, c.bucketName, minio.MakeBucketOptions{})
		if err != nil {
			return errors.Errorf("failed to create bucket: %w", err)
		}
	}

	return nil
}

// Check implements infra.Checker interface.
func (c *Client) Check(ctx context.Context) error {
	err := c.Ping(ctx)
	if err != nil {
		return errors.Errorf("blob storage ping failed: %w", err)
	}

	return nil
}

// Name implements infra.Checker interface.
func (c *Client) Name() string {
	return "blob_storage"
}

func (c *Client) Put(ctx context.Context, key string, data io.Reader, ttl time.Duration) error {
	// Note: TTL is not directly supported by minio-go
	// You would need to implement lifecycle policies separately if needed
	_, err := c.client.PutObject(
		ctx,
		c.bucketName,
		key,
		data,
		-1, // unknown size, minio-go will handle it
		minio.PutObjectOptions{
			ContentType: "application/octet-stream",
		},
	)
	if err != nil {
		return errors.Errorf("failed to put object: %w", err)
	}

	return nil
}

func (c *Client) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	obj, err := c.client.GetObject(ctx, c.bucketName, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, errors.Errorf("failed to get object: %w", err)
	}

	// Check if object exists by reading stat
	_, err = obj.Stat()
	if err != nil {
		_ = obj.Close()

		return nil, errors.Errorf("object not found: %w", err)
	}

	return obj, nil
}

func (c *Client) Delete(ctx context.Context, key string) error {
	err := c.client.RemoveObject(ctx, c.bucketName, key, minio.RemoveObjectOptions{})
	if err != nil {
		return errors.Errorf("failed to delete object: %w", err)
	}

	return nil
}

func (c *Client) Exists(ctx context.Context, key string) (bool, error) {
	_, err := c.client.StatObject(ctx, c.bucketName, key, minio.StatObjectOptions{})
	if err != nil {
		// Check if error is "not found"
		errResponse := minio.ToErrorResponse(err)
		if errResponse.Code == "NoSuchKey" {
			return false, nil
		}

		return false, errors.Errorf("failed to stat object: %w", err)
	}

	return true, nil
}

func (c *Client) List(ctx context.Context, prefix string) ([]service.ObjectInfo, error) {
	objectCh := c.client.ListObjects(ctx, c.bucketName, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	})

	result := make([]service.ObjectInfo, 0)

	for object := range objectCh {
		if object.Err != nil {
			return nil, errors.Errorf("failed to list objects: %w", object.Err)
		}

		result = append(result, service.ObjectInfo{
			Key:          object.Key,
			Size:         object.Size,
			LastModified: object.LastModified,
		})
	}

	return result, nil
}

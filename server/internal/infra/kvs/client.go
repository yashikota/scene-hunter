// Package kvs provides Valkey client implementations.
package kvs

import (
	"context"
	"fmt"
	"time"

	"github.com/valkey-io/valkey-go"
	domainkvs "github.com/yashikota/scene-hunter/server/internal/domain/kvs"
)

type Client struct {
	client valkey.Client
}

func NewClient(addr, password string) (domainkvs.KVS, error) {
	client, err := valkey.NewClient(valkey.ClientOption{
		InitAddress:  []string{addr},
		Password:     password,
		DisableCache: true, // miniredisやRESP2との互換性のためキャッシュを無効化
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create valkey client: %w", err)
	}

	return &Client{
		client: client,
	}, nil
}

func (c *Client) Close() {
	c.client.Close()
}

func (c *Client) Ping(ctx context.Context) error {
	cmd := c.client.B().Ping().Build()

	err := c.client.Do(ctx, cmd).Error()
	if err != nil {
		return fmt.Errorf("valkey ping failed: %w", err)
	}

	return nil
}

func (c *Client) Get(ctx context.Context, key string) (string, error) {
	cmd := c.client.B().Get().Key(key).Build()
	result := c.client.Do(ctx, cmd)

	val, err := result.ToString()
	if err != nil {
		return "", fmt.Errorf("get failed: %w", err)
	}

	return val, nil
}

func (c *Client) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	var cmd valkey.Completed

	if ttl > 0 {
		cmd = c.client.B().Set().Key(key).Value(value).Ex(ttl).Build()
	} else {
		cmd = c.client.B().Set().Key(key).Value(value).Build()
	}

	err := c.client.Do(ctx, cmd).Error()
	if err != nil {
		return fmt.Errorf("set failed: %w", err)
	}

	return nil
}

func (c *Client) Delete(ctx context.Context, key string) error {
	cmd := c.client.B().Del().Key(key).Build()

	err := c.client.Do(ctx, cmd).Error()
	if err != nil {
		return fmt.Errorf("delete failed: %w", err)
	}

	return nil
}

func (c *Client) Exists(ctx context.Context, key string) (bool, error) {
	cmd := c.client.B().Exists().Key(key).Build()
	result := c.client.Do(ctx, cmd)

	count, err := result.AsInt64()
	if err != nil {
		return false, fmt.Errorf("exists failed: %w", err)
	}

	return count > 0, nil
}

// Package kvs provides Valkey client implementations.
package kvs

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/valkey-io/valkey-go"
	"github.com/yashikota/scene-hunter/server/internal/service"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

type Client struct {
	client valkey.Client
}

func NewClient(addr, password string) (service.KVS, error) {
	// Parse redis:// scheme if present
	parsedAddr := addr
	if strings.HasPrefix(addr, "redis://") || strings.HasPrefix(addr, "rediss://") {
		u, err := url.Parse(addr)
		if err != nil {
			return nil, errors.Errorf("failed to parse redis URL: %w", err)
		}

		parsedAddr = u.Host
	}

	client, err := valkey.NewClient(valkey.ClientOption{
		InitAddress:  []string{parsedAddr},
		Password:     password,
		DisableCache: true, // miniredisやRESP2との互換性のためキャッシュを無効化
	})
	if err != nil {
		return nil, errors.Errorf("failed to create valkey client: %w", err)
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
		return errors.Errorf("valkey ping failed: %w", err)
	}

	return nil
}

// Check implements infra.Checker interface.
func (c *Client) Check(ctx context.Context) error {
	err := c.Ping(ctx)
	if err != nil {
		return errors.Errorf("valkey health check failed: %w", err)
	}

	return nil
}

// Name implements infra.Checker interface.
func (c *Client) Name() string {
	return "valkey"
}

func (c *Client) Get(ctx context.Context, key string) (string, error) {
	cmd := c.client.B().Get().Key(key).Build()
	result := c.client.Do(ctx, cmd)

	val, err := result.ToString()
	if err != nil {
		if valkey.IsValkeyNil(err) {
			return "", service.ErrNotFound
		}

		return "", errors.Errorf("get failed: %w", err)
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
		return errors.Errorf("set failed: %w", err)
	}

	return nil
}

// SetNX sets a key-value pair only if the key does not exist.
// Returns true if the key was set, false if the key already exists.
func (c *Client) SetNX(
	ctx context.Context,
	key string,
	value string,
	ttl time.Duration,
) (bool, error) {
	var cmd valkey.Completed

	if ttl > 0 {
		cmd = c.client.B().Set().Key(key).Value(value).Nx().Ex(ttl).Build()
	} else {
		cmd = c.client.B().Set().Key(key).Value(value).Nx().Build()
	}

	result := c.client.Do(ctx, cmd)

	resultErr := result.Error()
	if resultErr != nil {
		if valkey.IsValkeyNil(resultErr) {
			// Key already exists
			return false, nil
		}

		return false, errors.Errorf("setnx failed: %w", resultErr)
	}

	// Check if the operation succeeded
	str, err := result.ToString()
	if err != nil {
		// If we can't parse the response, the operation may have failed
		return false, errors.Errorf("failed to parse setnx response: %w", err)
	}

	return str == "OK", nil
}

func (c *Client) Delete(ctx context.Context, key string) error {
	cmd := c.client.B().Del().Key(key).Build()

	err := c.client.Do(ctx, cmd).Error()
	if err != nil {
		return errors.Errorf("delete failed: %w", err)
	}

	return nil
}

func (c *Client) Exists(ctx context.Context, key string) (bool, error) {
	cmd := c.client.B().Exists().Key(key).Build()
	result := c.client.Do(ctx, cmd)

	count, err := result.AsInt64()
	if err != nil {
		return false, errors.Errorf("exists failed: %w", err)
	}

	return count > 0, nil
}

// Eval executes a Lua script.
func (c *Client) Eval(ctx context.Context, script string, keys []string, args ...any) (any, error) {
	// Convert args to strings
	strArgs := make([]string, len(args))
	for i, arg := range args {
		strArgs[i] = toString(arg)
	}

	cmd := c.client.B().
		Eval().
		Script(script).
		Numkeys(int64(len(keys))).
		Key(keys...).
		Arg(strArgs...).
		Build()
	result := c.client.Do(ctx, cmd)

	if err := result.Error(); err != nil {
		return nil, errors.Errorf("eval failed: %w", err)
	}

	val, err := result.ToAny()
	if err != nil {
		return nil, errors.Errorf("failed to convert eval result: %w", err)
	}

	return val, nil
}

// SAdd adds members to a set.
func (c *Client) SAdd(ctx context.Context, key string, members ...string) error {
	cmd := c.client.B().Sadd().Key(key).Member(members...).Build()

	err := c.client.Do(ctx, cmd).Error()
	if err != nil {
		return errors.Errorf("sadd failed: %w", err)
	}

	return nil
}

// SMembers returns all members of a set.
func (c *Client) SMembers(ctx context.Context, key string) ([]string, error) {
	cmd := c.client.B().Smembers().Key(key).Build()
	result := c.client.Do(ctx, cmd)

	members, err := result.AsStrSlice()
	if err != nil {
		if valkey.IsValkeyNil(err) {
			return []string{}, nil
		}

		return nil, errors.Errorf("smembers failed: %w", err)
	}

	return members, nil
}

// SRem removes members from a set.
func (c *Client) SRem(ctx context.Context, key string, members ...string) error {
	cmd := c.client.B().Srem().Key(key).Member(members...).Build()

	err := c.client.Do(ctx, cmd).Error()
	if err != nil {
		return errors.Errorf("srem failed: %w", err)
	}

	return nil
}

// Expire sets a key's time to live in seconds.
func (c *Client) Expire(ctx context.Context, key string, ttl time.Duration) error {
	cmd := c.client.B().Expire().Key(key).Seconds(int64(ttl.Seconds())).Build()

	err := c.client.Do(ctx, cmd).Error()
	if err != nil {
		return errors.Errorf("expire failed: %w", err)
	}

	return nil
}

// TTL returns the remaining time to live of a key.
// Returns -2 if the key does not exist, -1 if the key has no expiration.
func (c *Client) TTL(ctx context.Context, key string) (time.Duration, error) {
	cmd := c.client.B().Ttl().Key(key).Build()
	result := c.client.Do(ctx, cmd)

	ttlSeconds, err := result.AsInt64()
	if err != nil {
		return 0, errors.Errorf("ttl failed: %w", err)
	}

	// -2 means key doesn't exist, -1 means no expiration
	if ttlSeconds < 0 {
		return time.Duration(ttlSeconds), nil
	}

	return time.Duration(ttlSeconds) * time.Second, nil
}

// toString converts an interface{} to string.
func toString(v any) string {
	return fmt.Sprintf("%v", v)
}

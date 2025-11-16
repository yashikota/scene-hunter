// Package db provides database client implementation using pgx.
package db

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yashikota/scene-hunter/server/internal/infra/db/queries"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

type Client struct {
	pool    *pgxpool.Pool
	Queries *queries.Queries
}

func NewClient(ctx context.Context, connString string) (*Client, error) {
	pool, err := pgxpool.New(ctx, connString)
	if err != nil {
		return nil, errors.Errorf("failed to create connection pool: %w", err)
	}

	err = pool.Ping(ctx)
	if err != nil {
		pool.Close()

		return nil, errors.Errorf("failed to ping database: %w", err)
	}

	return &Client{
		pool:    pool,
		Queries: queries.New(pool),
	}, nil
}

func (c *Client) Ping(ctx context.Context) error {
	err := c.pool.Ping(ctx)
	if err != nil {
		return errors.Errorf("ping failed: %w", err)
	}

	return nil
}

// Check implements infra.Checker interface.
func (c *Client) Check(ctx context.Context) error {
	err := c.Ping(ctx)
	if err != nil {
		return errors.Errorf("postgres ping failed: %w", err)
	}

	return nil
}

// Name implements infra.Checker interface.
func (c *Client) Name() string {
	return "postgres"
}

func (c *Client) Close() error {
	c.pool.Close()

	return nil
}

// Pool returns the underlying pgxpool.Pool for direct access when needed.
func (c *Client) Pool() *pgxpool.Pool {
	return c.pool
}

// Direct SQL execution methods for testing and advanced use cases

func (c *Client) Exec(ctx context.Context, sql string, args ...any) error {
	_, err := c.pool.Exec(ctx, sql, args...)
	if err != nil {
		return errors.Errorf("exec failed: %w", err)
	}

	return nil
}

func (c *Client) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	rows, err := c.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, errors.Errorf("query failed: %w", err)
	}

	return rows, nil
}

func (c *Client) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return c.pool.QueryRow(ctx, sql, args...)
}

func (c *Client) Begin(ctx context.Context) (pgx.Tx, error) {
	tx, err := c.pool.Begin(ctx)
	if err != nil {
		return nil, errors.Errorf("begin transaction failed: %w", err)
	}

	return tx, nil
}

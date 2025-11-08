package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	domaindb "github.com/yashikota/scene-hunter/server/internal/domain/db"
)

type PgxClient struct {
	pool *pgxpool.Pool
}

func NewPgxClient(ctx context.Context, connString string) (domaindb.DB, error) {
	pool, err := pgxpool.New(ctx, connString)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	err = pool.Ping(ctx)
	if err != nil {
		pool.Close()

		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &PgxClient{
		pool: pool,
	}, nil
}

func (c *PgxClient) Ping(ctx context.Context) error {
	err := c.pool.Ping(ctx)
	if err != nil {
		return fmt.Errorf("ping failed: %w", err)
	}

	return nil
}

// Check implements health.Checker interface.
func (c *PgxClient) Check(ctx context.Context) error {
	err := c.Ping(ctx)
	if err != nil {
		return fmt.Errorf("postgres ping failed: %w", err)
	}

	return nil
}

// Name implements health.Checker interface.
func (c *PgxClient) Name() string {
	return "postgres"
}

func (c *PgxClient) Close() error {
	c.pool.Close()

	return nil
}

func (c *PgxClient) Exec(ctx context.Context, sql string, args ...any) error {
	_, err := c.pool.Exec(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("exec failed: %w", err)
	}

	return nil
}

func (c *PgxClient) Query(ctx context.Context, sql string, args ...any) (domaindb.Rows, error) {
	rows, err := c.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}

	return &pgxRows{rows: rows}, nil
}

func (c *PgxClient) QueryRow(ctx context.Context, sql string, args ...any) domaindb.Row {
	row := c.pool.QueryRow(ctx, sql, args...)

	return &pgxRow{row: row}
}

func (c *PgxClient) Begin(ctx context.Context) (domaindb.Tx, error) {
	tx, err := c.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction failed: %w", err)
	}

	return &pgxTx{tx: tx}, nil
}

type pgxRows struct {
	rows pgx.Rows
}

func (r *pgxRows) Next() bool {
	return r.rows.Next()
}

func (r *pgxRows) Scan(dest ...any) error {
	err := r.rows.Scan(dest...)
	if err != nil {
		return fmt.Errorf("scan failed: %w", err)
	}

	return nil
}

func (r *pgxRows) Close() {
	r.rows.Close()
}

func (r *pgxRows) Err() error {
	err := r.rows.Err()
	if err != nil {
		return fmt.Errorf("rows error: %w", err)
	}

	return nil
}

type pgxRow struct {
	row pgx.Row
}

func (r *pgxRow) Scan(dest ...any) error {
	err := r.row.Scan(dest...)
	if err != nil {
		return fmt.Errorf("scan failed: %w", err)
	}

	return nil
}

type pgxTx struct {
	tx pgx.Tx
}

func (t *pgxTx) Exec(ctx context.Context, sql string, args ...any) error {
	_, err := t.tx.Exec(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("exec failed: %w", err)
	}

	return nil
}

func (t *pgxTx) Query(ctx context.Context, sql string, args ...any) (domaindb.Rows, error) {
	rows, err := t.tx.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}

	return &pgxRows{rows: rows}, nil
}

func (t *pgxTx) QueryRow(ctx context.Context, sql string, args ...any) domaindb.Row {
	row := t.tx.QueryRow(ctx, sql, args...)

	return &pgxRow{row: row}
}

func (t *pgxTx) Commit(ctx context.Context) error {
	err := t.tx.Commit(ctx)
	if err != nil {
		return fmt.Errorf("commit failed: %w", err)
	}

	return nil
}

func (t *pgxTx) Rollback(ctx context.Context) error {
	err := t.tx.Rollback(ctx)
	if err != nil {
		return fmt.Errorf("rollback failed: %w", err)
	}

	return nil
}

// Package db provides database domain interfaces.
package db

import "context"

type DB interface {
	Ping() error
	Close() error
	Exec(ctx context.Context, sql string, args ...any) error
	Query(ctx context.Context, sql string, args ...any) (Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) Row
	Begin(ctx context.Context) (Tx, error)
}

type Rows interface {
	Next() bool
	Scan(dest ...any) error
	Close()
	Err() error
}

type Row interface {
	Scan(dest ...any) error
}

type Tx interface {
	Exec(ctx context.Context, sql string, args ...any) error
	Query(ctx context.Context, sql string, args ...any) (Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) Row
	Commit(ctx context.Context) error
	Rollback(ctx context.Context) error
}

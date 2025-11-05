// Package db handles database connections.
package db

// DB represents a database interface.
type DB interface {
	Ping() error
	Close() error
}

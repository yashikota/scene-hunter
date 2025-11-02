package db

import (
	"database/sql"
)

type postgresDB struct {
	db *sql.DB
}

type DB interface {
	Ping() error
	Close() error
}

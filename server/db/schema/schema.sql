-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT '0001-01-01 00:00:00+00'::TIMESTAMPTZ
);

CREATE INDEX idx_users_code ON users(code);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- Rooms table
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    code VARCHAR(6) NOT NULL UNIQUE,
    expired_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_rooms_expired_at ON rooms(expired_at);


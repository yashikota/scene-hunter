-- Add new schema named "public"
CREATE SCHEMA IF NOT EXISTS "public";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT '0001-01-01 00:00:00+00'::TIMESTAMPTZ
);

CREATE INDEX idx_users_code ON users(code);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- name: CreateUser :one
INSERT INTO users (
    id,
    code,
    name,
    created_at,
    updated_at,
    deleted_at
) VALUES (
    $1, $2, $3, $4, $5, $6
) RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1 AND deleted_at = '0001-01-01 00:00:00+00'::TIMESTAMPTZ
LIMIT 1;

-- name: GetUserByCode :one
SELECT * FROM users
WHERE code = $1 AND deleted_at = '0001-01-01 00:00:00+00'::TIMESTAMPTZ
LIMIT 1;

-- name: UpdateUser :one
UPDATE users
SET
    code = $2,
    name = $3,
    updated_at = $4
WHERE id = $1 AND deleted_at = '0001-01-01 00:00:00+00'::TIMESTAMPTZ
RETURNING *;

-- name: DeleteUser :exec
UPDATE users
SET
    deleted_at = $2,
    updated_at = $2
WHERE id = $1;

-- name: ListUsers :many
SELECT * FROM users
WHERE deleted_at = '0001-01-01 00:00:00+00'::TIMESTAMPTZ
ORDER BY created_at DESC;


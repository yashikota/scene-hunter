-- name: CreateRoom :one
INSERT INTO rooms (
    id,
    code,
    expired_at,
    created_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: GetRoomByID :one
SELECT * FROM rooms
WHERE id = $1
LIMIT 1;

-- name: GetRoomByCode :one
SELECT * FROM rooms
WHERE code = $1
LIMIT 1;

-- name: UpdateRoom :one
UPDATE rooms
SET
    code = $2,
    expired_at = $3,
    updated_at = $4
WHERE id = $1
RETURNING *;

-- name: DeleteRoom :exec
DELETE FROM rooms
WHERE id = $1;

-- name: ListRooms :many
SELECT * FROM rooms
ORDER BY created_at DESC;

-- name: ListActiveRooms :many
SELECT * FROM rooms
WHERE expired_at > $1
ORDER BY created_at DESC;


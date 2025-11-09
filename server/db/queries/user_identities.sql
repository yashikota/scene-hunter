-- name: CreateUserIdentity :one
INSERT INTO user_identities (
    id,
    user_id,
    provider,
    subject,
    email,
    created_at
) VALUES (
    $1, $2, $3, $4, $5, $6
) RETURNING *;

-- name: GetUserIdentityByProviderAndSubject :one
SELECT * FROM user_identities
WHERE provider = $1 AND subject = $2
LIMIT 1;

-- name: GetUserIdentitiesByUserID :many
SELECT * FROM user_identities
WHERE user_id = $1
ORDER BY created_at DESC;

-- name: DeleteUserIdentity :exec
DELETE FROM user_identities
WHERE id = $1;

-- name: GetUserIdentityByID :one
SELECT * FROM user_identities
WHERE id = $1
LIMIT 1;

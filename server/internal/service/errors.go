package service

import "github.com/yashikota/scene-hunter/server/internal/util/errors"

// Common errors for service layer.
var (
	// ErrNotFound is returned when a resource is not found.
	ErrNotFound = errors.New("not found")
)

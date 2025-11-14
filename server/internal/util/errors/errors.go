// Package errors provides error handling utilities with stack trace support.
package errors

import (
	"errors"

	goerrors "github.com/go-errors/errors"
)

// New creates a new error with stack trace.
func New(msg string) error {
	return goerrors.New(msg)
}

// Errorf creates a new formatted error with stack trace.
func Errorf(format string, args ...any) error {
	return goerrors.Errorf(format, args...)
}

func Is(err error, target error) bool {
	return errors.Is(err, target)
}

func As(err error, target any) bool {
	return errors.As(err, target)
}

// Error is an error with stack trace support.
type Error = goerrors.Error

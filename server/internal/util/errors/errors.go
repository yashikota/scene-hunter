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

// Wrap wraps an existing error with stack trace.
// skip parameter allows skipping stack frames (usually 0).
func Wrap(err error, skip int) error {
	if err == nil {
		return nil
	}

	return goerrors.Wrap(err, skip)
}

// Errorf creates a new formatted error with stack trace.
func Errorf(format string, args ...any) error {
	return goerrors.Errorf(format, args...)
}

// AsGoError converts an error to *goerrors.Error if possible.
func AsGoError(err error) (*goerrors.Error, bool) {
	if err == nil {
		return nil, false
	}

	goErr := &goerrors.Error{}
	if errors.As(err, &goErr) {
		return goErr, true
	}

	return nil, false
}

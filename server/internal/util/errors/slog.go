package errors

import (
	"context"
	//nolint:depguard // errors package is deprecated
	"errors"
	"log/slog"

	goerrors "github.com/go-errors/errors"
)

// StackFrame represents a single stack frame for structured logging.
//
//nolint:tagliatelle // Use uppercase field names to match reference implementation
type StackFrame struct {
	File           string  `json:"File"`
	LineNumber     int     `json:"LineNumber"`
	Name           string  `json:"Name"`
	Package        string  `json:"Package"`
	ProgramCounter uintptr `json:"ProgramCounter"`
}

// LogError logs an error with stack trace using the provided logger.
func LogError(ctx context.Context, logger *slog.Logger, msg string, err error, args ...any) {
	if err == nil {
		logger.ErrorContext(ctx, msg, args...)

		return
	}

	// Extract stack trace if it's a go-errors.Error
	goErr := &goerrors.Error{}
	if errors.As(err, &goErr) {
		frames := goErr.StackFrames()

		stackFrames := make([]StackFrame, len(frames))
		for i, frame := range frames {
			stackFrames[i] = StackFrame{
				File:           frame.File,
				LineNumber:     frame.LineNumber,
				Name:           frame.Name,
				Package:        frame.Package,
				ProgramCounter: frame.ProgramCounter,
			}
		}

		// Create new args slice with error and stack trace
		logArgs := make([]any, 0, len(args)+4)
		logArgs = append(logArgs, args...)
		logArgs = append(logArgs, "error", goErr.Err.Error())
		logArgs = append(logArgs, "StackFrames", stackFrames)

		logger.ErrorContext(ctx, msg, logArgs...)
	} else {
		// Fallback to regular error logging
		logArgs := make([]any, 0, len(args)+2)
		logArgs = append(logArgs, args...)
		logArgs = append(logArgs, "error", err.Error())
		logger.ErrorContext(ctx, msg, logArgs...)
	}
}

// LogErrorCtx logs an error with stack trace using the default logger.
func LogErrorCtx(ctx context.Context, msg string, err error, args ...any) {
	LogError(ctx, slog.Default(), msg, err, args...)
}

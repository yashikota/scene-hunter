package errors

import (
	"context"
	"log/slog"
)

// LogError logs an error with stack trace using the provided logger.
func LogError(ctx context.Context, logger *slog.Logger, msg string, err error, args ...any) {
	if err == nil {
		logger.ErrorContext(ctx, msg, args...)

		return
	}

	// Extract stack trace using our custom StackTraces function
	traces := StackTraces(err)
	if len(traces) > 0 {
		// Create new args slice with error and stack trace
		logArgs := make([]any, 0, len(args)+4)
		logArgs = append(logArgs, args...)
		logArgs = append(logArgs, "error", err.Error())
		logArgs = append(logArgs, "stacktraces", traces)

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

package di

import (
	"context"
	"log/slog"

	"connectrpc.com/connect"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// errorLoggingInterceptor logs errors with stack traces.
type errorLoggingInterceptor struct {
	logger *slog.Logger
}

// newErrorLoggingInterceptor creates a new error logging interceptor.
func newErrorLoggingInterceptor(logger *slog.Logger) connect.UnaryInterceptorFunc {
	interceptor := &errorLoggingInterceptor{
		logger: logger,
	}

	return interceptor.intercept
}

func (i *errorLoggingInterceptor) intercept(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		resp, err := next(ctx, req)
		if err != nil {
			i.logError(ctx, req, err)
		}

		return resp, err
	}
}

func (i *errorLoggingInterceptor) logError(ctx context.Context, req connect.AnyRequest, err error) {
	procedure := req.Spec().Procedure

	// Extract the underlying error from connect.Error
	baseErr := err

	connectErr := &connect.Error{}
	if errors.As(err, &connectErr) {
		baseErr = connectErr.Unwrap()
		if baseErr == nil {
			baseErr = err
		}
	}

	// Try to extract stack trace using our custom errors package
	traces := errors.StackTraces(baseErr)
	if len(traces) > 0 {
		i.logger.ErrorContext(ctx, "RPC error",
			"procedure", procedure,
			"error", baseErr.Error(),
			"stacktraces", traces,
		)
	} else {
		// Fallback to regular error logging
		i.logger.ErrorContext(ctx, "RPC error",
			"procedure", procedure,
			"error", err.Error(),
		)
	}
}

package handler

import (
	"context"
	"errors"
	"log/slog"

	"connectrpc.com/connect"
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

// errorLoggingInterceptor logs errors with stack traces.
type errorLoggingInterceptor struct {
	logger *slog.Logger
}

// NewErrorLoggingInterceptor creates a new error logging interceptor.
func NewErrorLoggingInterceptor(logger *slog.Logger) connect.UnaryInterceptorFunc {
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

	// Try to extract stack trace from go-errors
	goErr := &goerrors.Error{}
	if errors.As(baseErr, &goErr) {
		frames := goErr.StackFrames()

		stackFrames := make([]StackFrame, len(frames))
		for idx, frame := range frames {
			stackFrames[idx] = StackFrame{
				File:           frame.File,
				LineNumber:     frame.LineNumber,
				Name:           frame.Name,
				Package:        frame.Package,
				ProgramCounter: frame.ProgramCounter,
			}
		}

		i.logger.ErrorContext(ctx, "RPC error",
			"procedure", procedure,
			"error", goErr.Err.Error(),
			"StackFrames", stackFrames,
		)
	} else {
		// Fallback to regular error logging
		i.logger.ErrorContext(ctx, "RPC error",
			"procedure", procedure,
			"error", err.Error(),
		)
	}
}

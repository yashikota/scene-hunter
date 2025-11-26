// Package errors provides error handling utilities with stack trace support.
// ref: https://github.com/k1LoW/errors/blob/main/errors.go
package errors

import (
	"encoding/json"
	"errors"
	"fmt"
	"runtime"
	"strings"
)

var (
	_ error          = (*StackTraceError)(nil)
	_ json.Marshaler = (*StackTraceError)(nil)
	_ fmt.Stringer   = (stackTraces)(nil)
)

// maxStackDepth is the maximum depth of the stack trace.
const maxStackDepth = 50

// As is a wrapper for [errors.As].
//
// [errors.As]: https://pkg.go.dev/errors#As
func As(err error, target any) bool {
	return errors.As(err, target)
}

// Is is a wrapper for [errors.Is].
//
// [errors.Is]: https://pkg.go.dev/errors#Is
func Is(err, target error) bool {
	return errors.Is(err, target)
}

// Join is a wrapper for [errors.Join].
//
// [errors.Join]: https://pkg.go.dev/errors#Join
func Join(errs ...error) error {
	return errors.Join(errs...)
}

// New is a wrapper for [errors.New].
//
// [errors.New]: https://pkg.go.dev/errors#New
func New(text string) error {
	return errors.New(text) //nolint:err113 // This is a wrapper function
}

// Errorf creates a new error with a formatted message and stack trace.
func Errorf(format string, args ...any) error {
	err := fmt.Errorf(format, args...) //nolint:err113 // This is a wrapper function

	return withStack(err)
}

// Unwrap is a wrapper for [errors.Unwrap].
//
// [errors.Unwrap]: https://pkg.go.dev/errors#Unwrap
func Unwrap(err error) error {
	return errors.Unwrap(err)
}

// WithStack sets the stack trace for the given error.
func WithStack(err error) error {
	return withStack(err)
}

// withStack is an internal function that adds stack trace to the error.
func withStack(err error) error {
	if err == nil {
		return nil
	}

	var errws *StackTraceError
	if errors.As(err, &errws) {
		return err
	}

	stack := make([]uintptr, maxStackDepth)
	length := runtime.Callers(3, stack)

	return &StackTraceError{
		Err:   err,
		stack: stack[:length],
	}
}

// StackTraces returns the stack traces of the given error(s).
func StackTraces(err error) stackTraces {
	je, ok := err.(joinError)
	if ok {
		// joined error
		var traces stackTraces

		errs := je.Unwrap()
		for _, e := range errs {
			traces = append(traces, StackTraces(e)...)
		}

		return traces
	}

	var errws *StackTraceError
	if !errors.As(err, &errws) {
		return stackTraces{}
	}

	errws.genFrames()

	return stackTraces{errws}
}

// Errors returns all joined errors in the given error.
func Errors(err error) []error {
	je, ok := err.(joinError)
	if !ok {
		return []error{err}
	}

	errs := je.Unwrap()

	var splitted []error
	for _, e := range errs {
		splitted = append(splitted, Errors(e)...)
	}

	return splitted
}

type stackTraces []*StackTraceError

// StackTraceError is an error with a stack trace.
type StackTraceError struct {
	Err    error
	Frames []Frame
	stack  []uintptr
}

// Frame represents a single stack frame.
type Frame struct {
	Name string `json:"name"`
	File string `json:"file"`
	Line int    `json:"line"`
}

func (traces stackTraces) String() string {
	var builder strings.Builder

	for i, errws := range traces {
		if i > 0 {
			builder.WriteString("\n")
		}

		builder.WriteString(errws.Error())

		for _, frame := range errws.Frames {
			builder.WriteString(fmt.Sprintf("\n%s\n\t%s:%d", frame.Name, frame.File, frame.Line))
		}
	}

	return builder.String()
}

func (errws *StackTraceError) Error() string {
	msg := errws.Err.Error()

	return msg
}

func (errws *StackTraceError) Unwrap() error {
	return errws.Err
}

func (errws *StackTraceError) MarshalJSON() ([]byte, error) {
	data := struct {
		Error  string  `json:"error"`
		Frames []Frame `json:"frames"`
	}{
		Error:  errws.Error(),
		Frames: errws.Frames,
	}

	result, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal stack trace error: %w", err)
	}

	return result, nil
}

type joinError interface {
	Unwrap() []error
}

func (errws *StackTraceError) genFrames() {
	if errws.Frames != nil {
		return
	}

	errws.Frames = make([]Frame, len(errws.stack))

	for i, pc := range errws.stack {
		// ref: https://github.com/go-errors/errors/blob/83795c27c02f5cdeaf9a5c3c3fd2709376f20b79/Frame.go#L36-L37
		fn := runtime.FuncForPC(pc - 1)
		name := fn.Name()
		file, line := fn.FileLine(pc - 1)
		errws.Frames[i] = Frame{
			Name: name,
			File: file,
			Line: line,
		}
	}
}

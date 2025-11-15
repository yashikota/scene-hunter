// Package health provides health check infrastructure interfaces and implementations.
package health

import "context"

type Checker interface {
	Check(ctx context.Context) error
	Name() string
}

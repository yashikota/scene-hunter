// Package health provides health check domain interfaces.
package health

import "context"

type Checker interface {
	Check(ctx context.Context) error
	Name() string
}

// Package chrono provides time-related infrastructure interfaces and implementations.
package chrono

import "time"

type Chrono interface {
	Now() time.Time
}

// RealChrono is a real-time implementation of Chrono.
type RealChrono struct{}

// New creates a new RealChrono.
func New() Chrono {
	return &RealChrono{}
}

// Now returns the current time.
func (r *RealChrono) Now() time.Time {
	return time.Now()
}

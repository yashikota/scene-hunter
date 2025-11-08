// Package chrono provides time-related infrastructure implementations.
package chrono

import (
	"time"

	"github.com/yashikota/scene-hunter/server/internal/domain/chrono"
)

type RealChrono struct{}

func New() chrono.Chrono {
	return &RealChrono{}
}

func (r *RealChrono) Now() time.Time {
	return time.Now()
}

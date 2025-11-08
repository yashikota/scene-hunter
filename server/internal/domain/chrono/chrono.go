// Package chrono provides time-related domain interfaces.
package chrono

import "time"

type Chrono interface {
	Now() time.Time
}

package chrono

import "time"

type Chrono interface {
	Now() time.Time
}

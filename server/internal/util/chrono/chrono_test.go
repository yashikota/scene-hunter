package chrono_test

import (
	"testing"
	"time"

	"github.com/yashikota/scene-hunter/server/internal/util/chrono"
)

func TestNew(t *testing.T) {
	t.Parallel()

	chronoProvider := chrono.New()

	if chronoProvider == nil {
		t.Error("New() returned nil")
	}
}

func TestRealChrono_Now(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		assertion func(t *testing.T)
	}{
		"returns time between before and after": {
			func(t *testing.T) {
				t.Helper()
				chronoProvider := chrono.New()
				before := time.Now()
				now := chronoProvider.Now()
				after := time.Now()
				if now.Before(before) {
					t.Errorf("Now() = %v is before the test started at %v", now, before)
				}
				if now.After(after) {
					t.Errorf("Now() = %v is after the test ended at %v", now, after)
				}
			},
		},
		"format as RFC3339": {
			func(t *testing.T) {
				t.Helper()
				chronoProvider := chrono.New()
				now := chronoProvider.Now()
				formatted := now.Format(time.RFC3339)
				if formatted == "" {
					t.Error("Now().Format(RFC3339) returned empty string")
				}
				parsed, err := time.Parse(time.RFC3339, formatted)
				if err != nil {
					t.Errorf("Failed to parse formatted time: %v", err)
				}
				if parsed.Unix() != now.Unix() {
					t.Errorf("Parsed time %v differs from original %v", parsed, now)
				}
			},
		},
		"is not zero time": {
			func(t *testing.T) {
				t.Helper()
				chronoProvider := chrono.New()
				now := chronoProvider.Now()
				if now.IsZero() {
					t.Error("Now() returned zero time")
				}
			},
		},
	}

	for testName, testCase := range tests {
		t.Run(testName, func(t *testing.T) {
			t.Parallel()
			testCase.assertion(t)
		})
	}
}

func TestRealChrono_Now_Properties(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		assertion func(t *testing.T)
	}{
		"multiple calls progress": {
			func(t *testing.T) {
				t.Helper()
				chronoProvider := chrono.New()
				first := chronoProvider.Now()
				time.Sleep(10 * time.Millisecond)
				second := chronoProvider.Now()
				if !second.After(first) {
					t.Errorf("Second call to Now() (%v) should be after first call (%v)", second, first)
				}
				duration := second.Sub(first)
				if duration < 10*time.Millisecond {
					t.Errorf("Duration between calls (%v) should be at least 10ms", duration)
				}
			},
		},
		"location properties": {
			func(t *testing.T) {
				t.Helper()
				chronoProvider := chrono.New()
				now := chronoProvider.Now()
				if now.Location() == nil {
					t.Error("Now() returned time with nil location")
				}
				utc := now.UTC()
				if utc.Location() != time.UTC {
					t.Error("Failed to convert to UTC")
				}
			},
		},
		"unix timestamp": {
			func(t *testing.T) {
				t.Helper()
				chronoProvider := chrono.New()
				now := chronoProvider.Now()
				unix := now.Unix()
				if unix <= 0 {
					t.Errorf("Unix timestamp %d should be positive", unix)
				}
				if unix < 1577836800 {
					t.Errorf("Unix timestamp %d is too old (before 2020)", unix)
				}
				if unix > 4102444800 {
					t.Errorf("Unix timestamp %d is too new (after 2100)", unix)
				}
			},
		},
		"weekday": {
			func(t *testing.T) {
				t.Helper()
				chronoProvider := chrono.New()
				now := chronoProvider.Now()
				weekday := now.Weekday()
				if weekday < time.Sunday || weekday > time.Saturday {
					t.Errorf("Invalid weekday: %v", weekday)
				}
			},
		},
		"year month day": {
			func(t *testing.T) {
				t.Helper()
				chronoProvider := chrono.New()
				now := chronoProvider.Now()
				year, month, day := now.Date()
				if year < 2020 || year > 2100 {
					t.Errorf("Year %d is out of expected range", year)
				}
				if month < time.January || month > time.December {
					t.Errorf("Invalid month: %v", month)
				}
				if day < 1 || day > 31 {
					t.Errorf("Invalid day: %d", day)
				}
			},
		},
		"hour minute second": {
			func(t *testing.T) {
				t.Helper()
				chronoProvider := chrono.New()
				now := chronoProvider.Now()
				hour, minute, sec := now.Clock()
				if hour < 0 || hour > 23 {
					t.Errorf("Invalid hour: %d", hour)
				}
				if minute < 0 || minute > 59 {
					t.Errorf("Invalid minute: %d", minute)
				}
				if sec < 0 || sec > 59 {
					t.Errorf("Invalid second: %d", sec)
				}
			},
		},
	}

	for testName, testCase := range tests {
		t.Run(testName, func(t *testing.T) {
			t.Parallel()
			testCase.assertion(t)
		})
	}
}

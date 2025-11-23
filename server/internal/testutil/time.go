// Package testutil はテストコードで使用するユーティリティ関数を提供する.
package testutil

import (
	"testing"
	"time"
)

// ToDate はUTC時刻の文字列からtime.Timeを作成する.
func ToDate(t *testing.T, date string) time.Time {
	t.Helper()
	d, err := time.Parse(time.DateTime, date)
	if err != nil {
		t.Fatalf("ToDate: %v", err)
	}

	return d.UTC()
}

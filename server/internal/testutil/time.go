// Package testutil はテストコードで使用するユーティリティ関数を提供する.
package testutil

import (
	"testing"
	"time"
)

// ToDate は指定されたフォーマットの文字列からtime.Timeを作成する.
func ToDate(t *testing.T, date string, format string) time.Time {
	t.Helper()

	d, err := time.Parse(format, date)
	if err != nil {
		t.Fatalf("ToDate: %v", err)
	}

	return d.UTC()
}

// Package testutil はテストコードで使用するユーティリティ関数を提供する.
package testutil

import (
	"testing"
	"time"
)

// MustParseTimeUTC は指定されたフォーマットの文字列からtime.Time (UTC) を作成します。パースに失敗した場合はテストを失敗させます。
func MustParseTimeUTC(t *testing.T, format string, value string) time.Time {
	t.Helper()

	d, err := time.Parse(format, value)
	if err != nil {
		t.Fatalf("MustParseTimeUTC: failed to parse time %q with format %q: %v", value, format, err)
	}

	return d.UTC()
}

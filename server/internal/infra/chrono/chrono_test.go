package chrono_test

import (
	"testing"
	"time"

	"github.com/yashikota/scene-hunter/server/internal/infra/chrono"
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

	chronoProvider := chrono.New()

	before := time.Now()
	now := chronoProvider.Now()
	after := time.Now()

	// nowが before と after の間にあることを確認
	if now.Before(before) {
		t.Errorf("Now() = %v is before the test started at %v", now, before)
	}

	if now.After(after) {
		t.Errorf("Now() = %v is after the test ended at %v", now, after)
	}
}

func TestRealChrono_Now_Format(t *testing.T) {
	t.Parallel()

	chronoProvider := chrono.New()
	now := chronoProvider.Now()

	// RFC3339形式でフォーマットできることを確認
	formatted := now.Format(time.RFC3339)
	if formatted == "" {
		t.Error("Now().Format(RFC3339) returned empty string")
	}

	// フォーマットされた文字列をパースできることを確認
	parsed, err := time.Parse(time.RFC3339, formatted)
	if err != nil {
		t.Errorf("Failed to parse formatted time: %v", err)
	}

	// パースした時刻が元の時刻とほぼ同じであることを確認（秒単位）
	if parsed.Unix() != now.Unix() {
		t.Errorf("Parsed time %v differs from original %v", parsed, now)
	}
}

func TestRealChrono_Now_IsNotZero(t *testing.T) {
	t.Parallel()

	chronoProvider := chrono.New()
	now := chronoProvider.Now()

	if now.IsZero() {
		t.Error("Now() returned zero time")
	}
}

func TestRealChrono_Now_MultipleCallsProgress(t *testing.T) {
	t.Parallel()

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
}

func TestRealChrono_Now_Location(t *testing.T) {
	t.Parallel()

	chronoProvider := chrono.New()
	now := chronoProvider.Now()

	// 現在時刻がローカルタイムゾーンであることを確認
	if now.Location() == nil {
		t.Error("Now() returned time with nil location")
	}

	// UTCに変換できることを確認
	utc := now.UTC()
	if utc.Location() != time.UTC {
		t.Error("Failed to convert to UTC")
	}
}

func TestRealChrono_Now_UnixTimestamp(t *testing.T) {
	t.Parallel()

	chronoProvider := chrono.New()
	now := chronoProvider.Now()

	// Unix タイムスタンプが正の値であることを確認
	unix := now.Unix()
	if unix <= 0 {
		t.Errorf("Unix timestamp %d should be positive", unix)
	}

	// Unix タイムスタンプが妥当な範囲であることを確認
	// 2020年1月1日 (1577836800) より後
	if unix < 1577836800 {
		t.Errorf("Unix timestamp %d is too old (before 2020)", unix)
	}

	// 2100年1月1日 (4102444800) より前
	if unix > 4102444800 {
		t.Errorf("Unix timestamp %d is too new (after 2100)", unix)
	}
}

func TestRealChrono_Now_Weekday(t *testing.T) {
	t.Parallel()

	chronoProvider := chrono.New()
	now := chronoProvider.Now()

	// 曜日が有効な値であることを確認
	weekday := now.Weekday()
	if weekday < time.Sunday || weekday > time.Saturday {
		t.Errorf("Invalid weekday: %v", weekday)
	}
}

func TestRealChrono_Now_YearMonthDay(t *testing.T) {
	t.Parallel()

	chronoProvider := chrono.New()
	now := chronoProvider.Now()

	year, month, day := now.Date()

	// 年が妥当な範囲であることを確認
	if year < 2020 || year > 2100 {
		t.Errorf("Year %d is out of expected range", year)
	}

	// 月が有効な値であることを確認
	if month < time.January || month > time.December {
		t.Errorf("Invalid month: %v", month)
	}

	// 日が有効な値であることを確認
	if day < 1 || day > 31 {
		t.Errorf("Invalid day: %d", day)
	}
}

func TestRealChrono_Now_HourMinuteSecond(t *testing.T) {
	t.Parallel()

	chronoProvider := chrono.New()
	now := chronoProvider.Now()

	hour, minute, sec := now.Clock()

	// 時が有効な値であることを確認
	if hour < 0 || hour > 23 {
		t.Errorf("Invalid hour: %d", hour)
	}

	// 分が有効な値であることを確認
	if minute < 0 || minute > 59 {
		t.Errorf("Invalid minute: %d", minute)
	}

	// 秒が有効な値であることを確認
	if sec < 0 || sec > 59 {
		t.Errorf("Invalid second: %d", sec)
	}
}

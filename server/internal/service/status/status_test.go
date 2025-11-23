package status_test

import (
	"context"
	"testing"
	"time"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	"github.com/yashikota/scene-hunter/server/internal/service/status"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

type mockChecker struct {
	name    string
	checkFn func(ctx context.Context) error
}

func (m *mockChecker) Check(ctx context.Context) error {
	if m.checkFn != nil {
		return m.checkFn(ctx)
	}

	return nil
}

func (m *mockChecker) Name() string {
	return m.name
}

type mockChrono struct {
	mockTime time.Time
}

func (m *mockChrono) Now() time.Time {
	return m.mockTime
}

// toDate はUTC時刻の文字列からtime.Timeを作成する.
func toDate(t *testing.T, date string) time.Time {
	t.Helper()
	d, err := time.Parse("2006-01-02 15:04:05", date)
	if err != nil {
		t.Fatalf("toDate: %v", err)
	}

	return d.UTC()
}

func TestService_Status(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		c []mockChecker
		h bool
		n int
	}{
		"all services healthy":    {[]mockChecker{{name: "service1", checkFn: func(_ context.Context) error { return nil }}, {name: "service2", checkFn: func(_ context.Context) error { return nil }}}, true, 2},
		"one service unhealthy":   {[]mockChecker{{name: "service1", checkFn: func(_ context.Context) error { return nil }}, {name: "service2", checkFn: func(_ context.Context) error { return errors.New("connection failed") }}}, false, 2},
		"all services unhealthy":  {[]mockChecker{{name: "service1", checkFn: func(_ context.Context) error { return errors.New("error1") }}, {name: "service2", checkFn: func(_ context.Context) error { return errors.New("error2") }}}, false, 2},
		"no checkers":             {[]mockChecker{}, true, 0},
	}

	for testName, tc := range tests {
		t.Run(testName, func(t *testing.T) {
			t.Parallel()

			checkers := make([]status.Checker, len(tc.c))
			for i := range tc.c {
				checkers[i] = &tc.c[i]
			}

			chronoProvider := &mockChrono{mockTime: toDate(t, "2024-01-01 00:00:00")}
			svc := status.NewService(checkers, chronoProvider)

			got, err := svc.Status(context.Background(), &scene_hunterv1.StatusRequest{})
			if err != nil {
				t.Errorf("Status() error = %v, want nil", err)
				return
			}

			if got.GetOverallHealthy() != tc.h {
				t.Errorf("Status() OverallHealthy = %v, want %v", got.GetOverallHealthy(), tc.h)
			}

			if len(got.GetServices()) != tc.n {
				t.Errorf("Status() Services count = %v, want %v", len(got.GetServices()), tc.n)
			}

			if got.GetTimestamp() == "" {
				t.Error("Status() Timestamp is empty")
			}
		})
	}
}

func TestNewService(t *testing.T) {
	t.Parallel()

	checkers := []status.Checker{}
	chronoProvider := &mockChrono{mockTime: time.Now()}
	svc := status.NewService(checkers, chronoProvider)

	if svc == nil {
		t.Error("NewService() returned nil")
	}
}

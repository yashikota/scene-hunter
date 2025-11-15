package status_test

import (
	"context"
	"testing"
	"time"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	"github.com/yashikota/scene-hunter/server/internal/infra/health"
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

func TestService_Status(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		checkers       []mockChecker
		wantHealthy    bool
		wantServiceCnt int
	}{
		{
			name: "all services healthy",
			checkers: []mockChecker{
				{name: "service1", checkFn: func(_ context.Context) error { return nil }},
				{name: "service2", checkFn: func(_ context.Context) error { return nil }},
			},
			wantHealthy:    true,
			wantServiceCnt: 2,
		},
		{
			name: "one service unhealthy",
			checkers: []mockChecker{
				{name: "service1", checkFn: func(_ context.Context) error { return nil }},
				{
					name:    "service2",
					checkFn: func(_ context.Context) error { return errors.New("connection failed") },
				},
			},
			wantHealthy:    false,
			wantServiceCnt: 2,
		},
		{
			name: "all services unhealthy",
			checkers: []mockChecker{
				{
					name:    "service1",
					checkFn: func(_ context.Context) error { return errors.New("error1") },
				},
				{
					name:    "service2",
					checkFn: func(_ context.Context) error { return errors.New("error2") },
				},
			},
			wantHealthy:    false,
			wantServiceCnt: 2,
		},
		{
			name:           "no checkers",
			checkers:       []mockChecker{},
			wantHealthy:    true,
			wantServiceCnt: 0,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			checkers := make([]health.Checker, len(testCase.checkers))
			for i := range testCase.checkers {
				checkers[i] = &testCase.checkers[i]
			}

			chronoProvider := &mockChrono{mockTime: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)}
			svc := status.NewService(checkers, chronoProvider)

			got, err := svc.Status(context.Background(), &scene_hunterv1.StatusRequest{})
			if err != nil {
				t.Errorf("Status() error = %v, want nil", err)

				return
			}

			if got.GetOverallHealthy() != testCase.wantHealthy {
				t.Errorf(
					"Status() OverallHealthy = %v, want %v",
					got.GetOverallHealthy(),
					testCase.wantHealthy,
				)
			}

			if len(got.GetServices()) != testCase.wantServiceCnt {
				t.Errorf(
					"Status() Services count = %v, want %v",
					len(got.GetServices()),
					testCase.wantServiceCnt,
				)
			}

			if got.GetTimestamp() == "" {
				t.Error("Status() Timestamp is empty")
			}
		})
	}
}

func TestNewService(t *testing.T) {
	t.Parallel()

	checkers := []health.Checker{}
	chronoProvider := &mockChrono{mockTime: time.Now()}
	svc := status.NewService(checkers, chronoProvider)

	if svc == nil {
		t.Error("NewService() returned nil")
	}
}

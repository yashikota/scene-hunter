package health_test

import (
	"context"
	"testing"
	"time"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	"github.com/yashikota/scene-hunter/server/internal/service/health"
	"github.com/yashikota/scene-hunter/server/internal/testutil"
	"github.com/yashikota/scene-hunter/server/internal/util/chrono"
)

type mockChrono struct {
	mockTime time.Time
}

func (m *mockChrono) Now() time.Time {
	return m.mockTime
}

func TestService_Health(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		mockTime time.Time
		want     *scene_hunterv1.HealthResponse
	}{
		"returns ok status with current timestamp":  {testutil.ToDate(t, "2024-01-01 12:00:00"), &scene_hunterv1.HealthResponse{Status: "ok", Timestamp: "2024-01-01T12:00:00Z"}},
		"returns ok status with different timestamp": {testutil.ToDate(t, "2024-12-31 23:59:59"), &scene_hunterv1.HealthResponse{Status: "ok", Timestamp: "2024-12-31T23:59:59Z"}},
		"returns ok status with another timestamp":   {testutil.ToDate(t, "2024-06-15 09:30:45"), &scene_hunterv1.HealthResponse{Status: "ok", Timestamp: "2024-06-15T09:30:45Z"}},
	}

	for testName, testCase := range tests {
		t.Run(testName, func(t *testing.T) {
			t.Parallel()

			chronoProvider := &mockChrono{mockTime: testCase.mockTime}
			svc := health.NewService(chronoProvider)

			got, err := svc.Health(context.Background(), &scene_hunterv1.HealthRequest{})
			if err != nil {
				t.Errorf("Health() error = %v, want nil", err)
				return
			}

			if got.GetStatus() != testCase.want.GetStatus() {
				t.Errorf("Health() Status = %v, want %v", got.GetStatus(), testCase.want.GetStatus())
			}

			if got.GetTimestamp() != testCase.want.GetTimestamp() {
				t.Errorf("Health() Timestamp = %v, want %v", got.GetTimestamp(), testCase.want.GetTimestamp())
			}
		})
	}
}

func TestService_Health_RealTime(t *testing.T) {
	t.Parallel()

	svc := health.NewService(chrono.New())

	got, err := svc.Health(context.Background(), &scene_hunterv1.HealthRequest{})
	if err != nil {
		t.Fatalf("Health() error = %v, want nil", err)
	}

	if got.GetStatus() != "ok" {
		t.Errorf("Health() Status = %v, want %v", got.GetStatus(), "ok")
	}

	_, err = time.Parse(time.RFC3339, got.GetTimestamp())
	if err != nil {
		t.Errorf("Health() Timestamp is not valid RFC3339 format: %v", err)
	}
}

func TestNewService(t *testing.T) {
	t.Parallel()

	svc := health.NewService(chrono.New())

	if svc == nil {
		t.Error("NewService() returned nil")
	}
}

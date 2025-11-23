package gemini_test

import (
	"context"
	"testing"

	"github.com/yashikota/scene-hunter/server/internal/infra/gemini"
)

func TestNewClient(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	tests := map[string]struct {
		a string
		m string
		w bool
	}{
		"empty API key should fail":     {"", "gemini-2.0-flash", true},
		"valid API key and model name": {"test-api-key", "gemini-2.0-flash", false},
	}

	for testName, tc := range tests {
		t.Run(testName, func(t *testing.T) {
			t.Parallel()

			_, err := gemini.NewClient(ctx, tc.a, tc.m)
			if (err != nil) != tc.w {
				t.Errorf("NewClient() error = %v, wantErr %v", err, tc.w)
			}
		})
	}
}

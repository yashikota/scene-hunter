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
		apiKey, modelName string
		wantErr           bool
	}{
		"empty API key should fail":    {"", "gemini-2.0-flash", true},
		"valid API key and model name": {"test-api-key", "gemini-2.0-flash", false},
	}

	for name, testCase := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			_, err := gemini.NewClient(ctx, testCase.apiKey, testCase.modelName)
			if (err != nil) != testCase.wantErr {
				t.Errorf("NewClient() error = %v, wantErr %v", err, testCase.wantErr)
			}
		})
	}
}

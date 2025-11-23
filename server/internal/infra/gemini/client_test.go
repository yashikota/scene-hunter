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
		apiKey    string
		modelName string
		wantErr   bool
	}{
		"empty API key should fail": {
			apiKey:    "",
			modelName: "gemini-2.0-flash",
			wantErr:   true,
		},
		"valid API key and model name": {
			apiKey:    "test-api-key",
			modelName: "gemini-2.0-flash",
			wantErr:   false,
		},
	}

	for testName, testCase := range tests {
		t.Run(testName, func(t *testing.T) {
			t.Parallel()

			_, err := gemini.NewClient(ctx, testCase.apiKey, testCase.modelName)
			if (err != nil) != testCase.wantErr {
				t.Errorf("NewClient() error = %v, wantErr %v", err, testCase.wantErr)
			}
		})
	}
}

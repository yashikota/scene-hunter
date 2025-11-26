package gemini_test

import (
	"context"
	"io"
	"strings"
	"testing"

	. "github.com/ovechkin-dm/mockio/v2/mock"
	"github.com/yashikota/scene-hunter/server/internal/service"
	"github.com/yashikota/scene-hunter/server/internal/service/gemini"
)

func TestNewService(t *testing.T) {
	t.Parallel()

	ctrl := NewMockController(t)

	blobClient := Mock[service.Blob](ctrl)
	geminiClient := Mock[service.Gemini](ctrl)

	svc := gemini.NewService(blobClient, geminiClient)
	if svc == nil {
		t.Error("NewService() returned nil")
	}
}

func TestService_AnalyzeImageFromBlob(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	tests := map[string]struct {
		imageKey     string
		prompt       string
		blobData     []byte
		blobError    error
		geminiResult *service.ImageAnalysisResult
		geminiError  error
		wantErr      bool
	}{
		"successful analysis": {
			"test.jpg",
			"Describe 5 features of this image in Japanese",
			[]byte("fake image data"),
			nil,
			&service.ImageAnalysisResult{
				Features: []string{"feature1", "feature2", "feature3", "feature4", "feature5"},
			},
			nil,
			false,
		},
	}

	for name, testCase := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			ctrl := NewMockController(t)

			blobClient := Mock[service.Blob](ctrl)
			geminiClient := Mock[service.Gemini](ctrl)

			// Setup expectations
			//nolint:contextcheck // Mock expectation setup doesn't inherit context
			WhenDouble(blobClient.Get(Any[context.Context](), Exact(testCase.imageKey))).
				ThenReturn(io.NopCloser(strings.NewReader(string(testCase.blobData))), testCase.blobError)

			if testCase.blobError == nil {
				//nolint:contextcheck // Mock expectation setup doesn't inherit context
				WhenDouble(
					geminiClient.AnalyzeImage(
						Any[context.Context](),
						Any[[]byte](),
						Any[string](),
						Exact(testCase.prompt),
					),
				).
					ThenReturn(testCase.geminiResult, testCase.geminiError)
			}

			svc := gemini.NewService(blobClient, geminiClient)
			result, err := svc.AnalyzeImageFromBlob(ctx, testCase.imageKey, testCase.prompt)

			if (err != nil) != testCase.wantErr {
				t.Errorf("AnalyzeImageFromBlob() error = %v, wantErr %v", err, testCase.wantErr)

				return
			}

			if !testCase.wantErr && result == nil {
				t.Error("AnalyzeImageFromBlob() returned nil result")
			}
		})
	}
}

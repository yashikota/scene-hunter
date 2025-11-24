package gemini_test

import (
	"context"
	"io"
	"strings"
	"testing"

	infragemini "github.com/yashikota/scene-hunter/server/internal/infra/gemini"
	"github.com/yashikota/scene-hunter/server/internal/service/gemini"
	"go.uber.org/mock/gomock"
)

func TestNewService(t *testing.T) {
	t.Parallel()

	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	blobClient := NewMockBlob(ctrl)
	geminiClient := NewMockGemini(ctrl)

	service := gemini.NewService(blobClient, geminiClient)
	if service == nil {
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
		geminiResult *infragemini.ImageAnalysisResult
		geminiError  error
		wantErr      bool
	}{
		"successful analysis": {
			"test.jpg",
			"Describe 5 features of this image in Japanese",
			[]byte("fake image data"),
			nil,
			&infragemini.ImageAnalysisResult{
				Features: []string{"feature1", "feature2", "feature3", "feature4", "feature5"},
			},
			nil,
			false,
		},
	}

	for name, testCase := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			ctrl := gomock.NewController(t)
			defer ctrl.Finish()

			blobClient := NewMockBlob(ctrl)
			geminiClient := NewMockGemini(ctrl)

			// Setup expectations
			blobClient.EXPECT().
				Get(gomock.Any(), testCase.imageKey).
				Return(io.NopCloser(strings.NewReader(string(testCase.blobData))), testCase.blobError).
				Times(1)

			if testCase.blobError == nil {
				geminiClient.EXPECT().
					AnalyzeImage(gomock.Any(), testCase.blobData, gomock.Any(), testCase.prompt).
					Return(testCase.geminiResult, testCase.geminiError).
					Times(1)
			}

			service := gemini.NewService(blobClient, geminiClient)
			result, err := service.AnalyzeImageFromBlob(ctx, testCase.imageKey, testCase.prompt)

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

package gemini_test

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"

	domainblob "github.com/yashikota/scene-hunter/server/internal/domain/blob"
	domaingemini "github.com/yashikota/scene-hunter/server/internal/domain/gemini"
	"github.com/yashikota/scene-hunter/server/internal/service/gemini"
)

// mockBlobClient is a mock implementation of domainblob.Blob.
type mockBlobClient struct {
	getData  []byte
	getError error
}

func (m *mockBlobClient) Ping(_ context.Context) error {
	return nil
}

func (m *mockBlobClient) Put(_ context.Context, _ string, _ io.Reader, _ time.Duration) error {
	return nil
}

func (m *mockBlobClient) Get(_ context.Context, _ string) (io.ReadCloser, error) {
	if m.getError != nil {
		return nil, m.getError
	}

	return io.NopCloser(strings.NewReader(string(m.getData))), nil
}

func (m *mockBlobClient) Delete(_ context.Context, _ string) error {
	return nil
}

func (m *mockBlobClient) Exists(_ context.Context, _ string) (bool, error) {
	return true, nil
}

func (m *mockBlobClient) List(_ context.Context, _ string) ([]domainblob.ObjectInfo, error) {
	return nil, nil
}

// mockGeminiClient is a mock implementation of domaingemini.Gemini.
type mockGeminiClient struct {
	analyzeResult *domaingemini.ImageAnalysisResult
	analyzeError  error
}

func (m *mockGeminiClient) AnalyzeImage(
	_ context.Context,
	_ []byte,
	_ string,
	_ string,
) (*domaingemini.ImageAnalysisResult, error) {
	if m.analyzeError != nil {
		return nil, m.analyzeError
	}

	return m.analyzeResult, nil
}

func TestNewService(t *testing.T) {
	t.Parallel()

	blobClient := &mockBlobClient{}
	geminiClient := &mockGeminiClient{}

	service := gemini.NewService(blobClient, geminiClient)
	if service == nil {
		t.Error("NewService() returned nil")
	}
}

func TestService_AnalyzeImageFromBlob(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	tests := []struct {
		name         string
		imageKey     string
		prompt       string
		blobClient   *mockBlobClient
		geminiClient *mockGeminiClient
		wantErr      bool
	}{
		{
			name:     "successful analysis",
			imageKey: "test.jpg",
			prompt:   "Describe 5 features of this image in Japanese",
			blobClient: &mockBlobClient{
				getData: []byte("fake image data"),
			},
			geminiClient: &mockGeminiClient{
				analyzeResult: &domaingemini.ImageAnalysisResult{
					Features: []string{"feature1", "feature2", "feature3", "feature4", "feature5"},
				},
			},
			wantErr: false,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			service := gemini.NewService(testCase.blobClient, testCase.geminiClient)
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

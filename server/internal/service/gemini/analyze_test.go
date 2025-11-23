package gemini_test

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"

	infrablob "github.com/yashikota/scene-hunter/server/internal/infra/blob"
	infragemini "github.com/yashikota/scene-hunter/server/internal/infra/gemini"
	"github.com/yashikota/scene-hunter/server/internal/service/gemini"
)

// mockBlobClient is a mock implementation of infrablob.Blob.
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

func (m *mockBlobClient) List(_ context.Context, _ string) ([]infrablob.ObjectInfo, error) {
	return nil, nil
}

// mockGeminiClient is a mock implementation of infragemini.Gemini.
type mockGeminiClient struct {
	analyzeResult *infragemini.ImageAnalysisResult
	analyzeError  error
}

func (m *mockGeminiClient) AnalyzeImage(
	_ context.Context,
	_ []byte,
	_ string,
	_ string,
) (*infragemini.ImageAnalysisResult, error) {
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

	tests := map[string]struct {
		k string
		p string
		b *mockBlobClient
		g *mockGeminiClient
		w bool
	}{
		"successful analysis": {"test.jpg", "Describe 5 features of this image in Japanese", &mockBlobClient{getData: []byte("fake image data")}, &mockGeminiClient{analyzeResult: &infragemini.ImageAnalysisResult{Features: []string{"feature1", "feature2", "feature3", "feature4", "feature5"}}}, false},
	}

	for testName, tc := range tests {
		t.Run(testName, func(t *testing.T) {
			t.Parallel()

			service := gemini.NewService(tc.b, tc.g)
			result, err := service.AnalyzeImageFromBlob(ctx, tc.k, tc.p)

			if (err != nil) != tc.w {
				t.Errorf("AnalyzeImageFromBlob() error = %v, wantErr %v", err, tc.w)
				return
			}

			if !tc.w && result == nil {
				t.Error("AnalyzeImageFromBlob() returned nil result")
			}
		})
	}
}

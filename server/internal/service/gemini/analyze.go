// Package gemini provides Gemini AI service implementations.
package gemini

import (
	"context"
	"fmt"
	"io"

	domainblob "github.com/yashikota/scene-hunter/server/internal/domain/blob"
	domaingemini "github.com/yashikota/scene-hunter/server/internal/domain/gemini"
)

// Service is a Gemini service.
type Service struct {
	blobClient   domainblob.Blob
	geminiClient domaingemini.Gemini
}

// NewService creates a new Gemini service.
func NewService(blobClient domainblob.Blob, geminiClient domaingemini.Gemini) *Service {
	return &Service{
		blobClient:   blobClient,
		geminiClient: geminiClient,
	}
}

// AnalyzeImageFromBlob analyzes an image from blob storage.
func (s *Service) AnalyzeImageFromBlob(
	ctx context.Context,
	imageKey, prompt string,
) (*domaingemini.ImageAnalysisResult, error) {
	// Get image from blob storage
	reader, err := s.blobClient.Get(ctx, imageKey)
	if err != nil {
		return nil, fmt.Errorf("failed to get image from blob: %w", err)
	}

	defer func() {
		_ = reader.Close()
	}()

	// Read image data
	imageData, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to read image data: %w", err)
	}

	// Analyze image with Gemini
	result, err := s.geminiClient.AnalyzeImage(ctx, imageData, prompt)
	if err != nil {
		return nil, fmt.Errorf("failed to analyze image: %w", err)
	}

	return result, nil
}

// Package gemini provides Gemini AI service implementations.
package gemini

import (
	"context"
	"io"
	"net/http"

	"github.com/yashikota/scene-hunter/server/internal/service"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// Service is a Gemini service.
type Service struct {
	blobClient   service.Blob
	geminiClient service.Gemini
}

// NewService creates a new Gemini service.
func NewService(blobClient service.Blob, geminiClient service.Gemini) *Service {
	return &Service{
		blobClient:   blobClient,
		geminiClient: geminiClient,
	}
}

// detectImageMIMEType detects the MIME type of an image from its content.
func detectImageMIMEType(data []byte) string {
	// http.DetectContentType correctly detects JPEG, PNG, WebP and other common formats
	return http.DetectContentType(data)
}

// AnalyzeImageFromBlob analyzes an image from blob storage.
func (s *Service) AnalyzeImageFromBlob(
	ctx context.Context,
	imageKey, prompt string,
) (*service.ImageAnalysisResult, error) {
	// Get image from blob storage
	reader, err := s.blobClient.Get(ctx, imageKey)
	if err != nil {
		return nil, errors.Errorf("failed to get image from blob: %w", err)
	}

	defer func() {
		_ = reader.Close()
	}()

	// Read image data
	imageData, err := io.ReadAll(reader)
	if err != nil {
		return nil, errors.Errorf("failed to read image data: %w", err)
	}

	// Detect MIME type from image data
	mimeType := detectImageMIMEType(imageData)

	// Analyze image with Gemini
	result, err := s.geminiClient.AnalyzeImage(ctx, imageData, mimeType, prompt)
	if err != nil {
		return nil, errors.Errorf("failed to analyze image: %w", err)
	}

	return result, nil
}

// Package gemini provides Gemini AI service implementations.
package gemini

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"

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

// detectImageMIMEType detects the MIME type of an image from its content.
func detectImageMIMEType(data []byte) string {
	// Use http.DetectContentType which checks the first 512 bytes
	mimeType := http.DetectContentType(data)

	// http.DetectContentType might return "application/octet-stream" for some images
	// Check magic numbers manually for better detection
	if len(data) >= 8 {
		// PNG: 89 50 4E 47 0D 0A 1A 0A
		if bytes.Equal(data[:8], []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}) {
			return "image/png"
		}
	}

	if len(data) >= 2 {
		// JPEG: FF D8
		if data[0] == 0xFF && data[1] == 0xD8 {
			return "image/jpeg"
		}
	}

	if len(data) >= 12 {
		// WebP: RIFF .... WEBP
		if bytes.Equal(data[:4], []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WEBP")) {
			return "image/webp"
		}
	}

	// Fallback to http.DetectContentType result
	return mimeType
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

	// Detect MIME type from image data
	mimeType := detectImageMIMEType(imageData)

	// Analyze image with Gemini
	result, err := s.geminiClient.AnalyzeImage(ctx, imageData, mimeType, prompt)
	if err != nil {
		return nil, fmt.Errorf("failed to analyze image: %w", err)
	}

	return result, nil
}

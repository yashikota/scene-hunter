package gemini

import (
	"context"
)

// ImageAnalysisResult represents the result of image analysis.
type ImageAnalysisResult struct {
	Features []string
}

// Gemini is an interface for Gemini AI operations.
type Gemini interface {
	AnalyzeImage(
		ctx context.Context,
		imageData []byte,
		mimeType string,
		prompt string,
	) (*ImageAnalysisResult, error)
}

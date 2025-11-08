package gemini

import (
	"context"
)

type ImageAnalysisResult struct {
	Features []string
}

type Gemini interface {
	AnalyzeImage(
		ctx context.Context,
		imageData []byte,
		mimeType string,
		prompt string,
	) (*ImageAnalysisResult, error)
}

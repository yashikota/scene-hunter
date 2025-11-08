package gemini

import (
	"context"
	"encoding/json"

	domaingemini "github.com/yashikota/scene-hunter/server/internal/domain/gemini"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
	"google.golang.org/genai"
)

type Client struct {
	client    *genai.Client
	modelName string
}

func NewClient(ctx context.Context, apiKey, modelName string) (domaingemini.Gemini, error) {
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey: apiKey,
	})
	if err != nil {
		return nil, errors.Errorf("failed to create genai client: %w", err)
	}

	return &Client{
		client:    client,
		modelName: modelName,
	}, nil
}

func ptr[T any](v T) *T {
	return &v
}

func (c *Client) AnalyzeImage(
	ctx context.Context,
	imageData []byte,
	mimeType string,
	prompt string,
) (*domaingemini.ImageAnalysisResult, error) {
	schema := &genai.Schema{
		Type: "object",
		Properties: map[string]*genai.Schema{
			"result": {
				Type:     "array",
				MinItems: ptr(int64(5)),
				MaxItems: ptr(int64(5)),
				Items: &genai.Schema{
					Type: "string",
				},
			},
		},
		Required:         []string{"result"},
		PropertyOrdering: []string{"result"},
	}

	config := &genai.GenerateContentConfig{
		ResponseMIMEType: "application/json",
		ResponseSchema:   schema,
	}

	parts := []*genai.Part{
		{Text: prompt},
		{
			InlineData: &genai.Blob{
				Data:     imageData,
				MIMEType: mimeType,
			},
		},
	}

	result, err := c.client.Models.GenerateContent(
		ctx,
		c.modelName,
		[]*genai.Content{{Parts: parts}},
		config,
	)
	if err != nil {
		return nil, errors.Errorf("failed to generate content: %w", err)
	}

	// Parse the JSON response
	responseText := result.Text()

	var response struct {
		Result []string `json:"result"`
	}

	err = json.Unmarshal([]byte(responseText), &response)
	if err != nil {
		return nil, errors.Errorf("failed to unmarshal response: %w", err)
	}

	return &domaingemini.ImageAnalysisResult{
		Features: response.Result,
	}, nil
}

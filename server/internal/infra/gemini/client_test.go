// Package gemini provides Gemini AI client implementations.
package gemini

import (
	"context"
	"testing"
)

func TestNewClient(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	// Test with empty API key (should succeed in creating client, but will fail on actual API calls)
	_, err := NewClient(ctx, "", "gemini-2.0-flash")
	if err != nil {
		t.Errorf("NewClient() error = %v, want nil", err)
	}
}

func TestPtr(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		value int64
	}{
		{
			name:  "positive value",
			value: 5,
		},
		{
			name:  "zero value",
			value: 0,
		},
		{
			name:  "negative value",
			value: -1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			result := ptr(tt.value)
			if result == nil {
				t.Error("ptr() returned nil")
			}
			if *result != tt.value {
				t.Errorf("ptr() = %v, want %v", *result, tt.value)
			}
		})
	}
}


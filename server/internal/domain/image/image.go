// Package image provides image handling domain logic.
package image

import (
	"bytes"
	"fmt"
	"path/filepath"
	"slices"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

const MaxImageSize = 10 * 1024 * 1024

var (
	// ErrEmptyData is returned when image data is empty.
	ErrEmptyData = errors.New("image data is empty")
	// ErrSizeTooLarge is returned when image size exceeds the maximum allowed size.
	ErrSizeTooLarge = errors.New("image size exceeds maximum allowed size")
	// ErrUnsupportedContentType is returned when the content type is not supported.
	ErrUnsupportedContentType = errors.New("unsupported content type")
	// ErrDataTooShort is returned when image data is too short to determine format.
	ErrDataTooShort = errors.New("image data too short to determine format")
	// ErrInvalidJPEG is returned when data does not match JPEG format.
	ErrInvalidJPEG = errors.New("data does not match JPEG format")
	// ErrInvalidPNG is returned when data does not match PNG format.
	ErrInvalidPNG = errors.New("data does not match PNG format")
	// ErrInvalidWebP is returned when data does not match WebP format.
	ErrInvalidWebP = errors.New("data does not match WebP format")
	// ErrUnknownContentType is returned when content type is unknown.
	ErrUnknownContentType = errors.New("unknown content type")
)

// Image represents an image in the domain.
type Image struct {
	ID          uuid.UUID
	RoomCode    string
	ContentType string
	Data        []byte
}

// NewImage creates a new Image with the given room code, content type, and data.
func NewImage(roomCode string, contentType string, data []byte) (*Image, error) {
	imageID, err := uuid.NewV7()
	if err != nil {
		return nil, errors.Errorf("failed to generate image ID: %w", err)
	}

	img := &Image{
		ID:          imageID,
		RoomCode:    roomCode,
		ContentType: contentType,
		Data:        data,
	}

	err = img.Validate()
	if err != nil {
		return nil, err
	}

	return img, nil
}

// Validate validates the image data.
func (i *Image) Validate() error {
	// Check size
	if len(i.Data) == 0 {
		return ErrEmptyData
	}

	if len(i.Data) > MaxImageSize {
		return errors.Errorf("%w: %d bytes", ErrSizeTooLarge, len(i.Data))
	}

	// Check content type
	if !isValidContentType(i.ContentType) {
		return errors.Errorf("%w: %s", ErrUnsupportedContentType, i.ContentType)
	}

	// Verify image format matches content type
	err := verifyImageFormat(i.Data, i.ContentType)
	if err != nil {
		return errors.Errorf("image format verification failed: %w", err)
	}

	return nil
}

// Path returns the storage path for the image.
func (i *Image) Path() string {
	ext := getExtension(i.ContentType)
	filename := fmt.Sprintf("%s.%s", i.ID.String(), ext)

	return filepath.Join("game", i.RoomCode, filename)
}

// Reader returns a bytes.Reader for the image data.
func (i *Image) Reader() *bytes.Reader {
	return bytes.NewReader(i.Data)
}

// getExtension returns the file extension for the given content type.
func getExtension(contentType string) string {
	extensions := map[string]string{
		"image/jpeg": "jpg",
		"image/png":  "png",
		"image/webp": "webp",
	}

	return extensions[contentType]
}

// isValidContentType checks if the content type is supported.
func isValidContentType(contentType string) bool {
	supportedTypes := []string{
		"image/jpeg",
		"image/png",
		"image/webp",
	}

	return slices.Contains(supportedTypes, contentType)
}

// verifyImageFormat verifies that the image data matches the declared content type.
func verifyImageFormat(data []byte, contentType string) error {
	if len(data) < 12 {
		return ErrDataTooShort
	}

	switch contentType {
	case "image/jpeg":
		// JPEG magic bytes: FF D8 FF
		if data[0] != 0xFF || data[1] != 0xD8 || data[2] != 0xFF {
			return ErrInvalidJPEG
		}
	case "image/png":
		// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
		pngHeader := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
		if !bytes.Equal(data[:8], pngHeader) {
			return ErrInvalidPNG
		}
	case "image/webp":
		// WebP magic bytes: RIFF xxxx WEBP
		if !bytes.Equal(data[:4], []byte("RIFF")) || !bytes.Equal(data[8:12], []byte("WEBP")) {
			return ErrInvalidWebP
		}
	default:
		return errors.Errorf("%w: %s", ErrUnknownContentType, contentType)
	}

	return nil
}

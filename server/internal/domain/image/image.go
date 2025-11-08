package image

import (
	"bytes"
	"fmt"
	"path/filepath"
	"slices"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// MaxImageSize は画像の最大サイズ（10MB）.
const MaxImageSize = 10 * 1024 * 1024

var (
	ErrEmptyData              = errors.New("image data is empty")
	ErrSizeTooLarge           = errors.New("image size exceeds maximum allowed size")
	ErrUnsupportedContentType = errors.New("unsupported content type")
	ErrDataTooShort           = errors.New("image data too short to determine format")
	ErrInvalidJPEG            = errors.New("data does not match JPEG format")
	ErrInvalidPNG             = errors.New("data does not match PNG format")
	ErrInvalidWebP            = errors.New("data does not match WebP format")
	ErrUnknownContentType     = errors.New("unknown content type")
)

type Image struct {
	ID          uuid.UUID
	RoomCode    string
	ContentType string
	Data        []byte
}

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

func (i *Image) Path() string {
	ext := getExtension(i.ContentType)
	filename := fmt.Sprintf("%s.%s", i.ID.String(), ext)

	return filepath.Join("game", i.RoomCode, filename)
}

func (i *Image) Reader() *bytes.Reader {
	return bytes.NewReader(i.Data)
}

func getExtension(contentType string) string {
	extensions := map[string]string{
		"image/jpeg": "jpg",
		"image/png":  "png",
		"image/webp": "webp",
	}

	return extensions[contentType]
}

func isValidContentType(contentType string) bool {
	supportedTypes := []string{
		"image/jpeg",
		"image/png",
		"image/webp",
	}

	return slices.Contains(supportedTypes, contentType)
}

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

package util

import (
	"io"
	"mime/multipart"
	"net/textproto"
	"testing"
)

func TestDetectFileType(t *testing.T) {
	tests := []struct {
		name     string
		content  []byte
		expected FileType
	}{
		{
			name:     "JPEG file",
			content:  []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01},
			expected: JPEG,
		},
		{
			name:     "PNG file",
			content:  []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D},
			expected: PNG,
		},
		{
			name:     "GIF file",
			content:  []byte{0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x0A, 0x00, 0x0A, 0x00, 0x91, 0x00},
			expected: GIF,
		},
		{
			name:     "Unknown file",
			content:  []byte{0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B},
			expected: UNKNOWN,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a mock multipart.File
			file := &mockMultipartFile{
				content: tt.content,
				offset:  0,
			}

			// Call the function
			fileType, err := DetectFileType(file)
			if err != nil {
				t.Fatalf("DetectFileType() error = %v", err)
			}

			// Check the result
			if fileType != tt.expected {
				t.Errorf("DetectFileType() = %v, want %v", fileType, tt.expected)
			}
		})
	}
}

func TestValidateFileType(t *testing.T) {
	tests := []struct {
		name         string
		fileType     FileType
		allowedTypes []string
		expected     bool
	}{
		{
			name:         "JPEG allowed",
			fileType:     JPEG,
			allowedTypes: []string{"jpg", "png"},
			expected:     true,
		},
		{
			name:         "JPEG allowed with jpeg extension",
			fileType:     JPEG,
			allowedTypes: []string{"jpeg", "png"},
			expected:     true,
		},
		{
			name:         "PNG allowed",
			fileType:     PNG,
			allowedTypes: []string{"jpg", "png"},
			expected:     true,
		},
		{
			name:         "GIF not allowed",
			fileType:     GIF,
			allowedTypes: []string{"jpg", "png"},
			expected:     false,
		},
		{
			name:         "Unknown not allowed",
			fileType:     UNKNOWN,
			allowedTypes: []string{"jpg", "png"},
			expected:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Call the function
			result := ValidateFileType(tt.fileType, tt.allowedTypes)

			// Check the result
			if result != tt.expected {
				t.Errorf("ValidateFileType() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestGetMimeType(t *testing.T) {
	tests := []struct {
		name     string
		fileType FileType
		expected string
	}{
		{
			name:     "JPEG mime type",
			fileType: JPEG,
			expected: "image/jpeg",
		},
		{
			name:     "PNG mime type",
			fileType: PNG,
			expected: "image/png",
		},
		{
			name:     "GIF mime type",
			fileType: GIF,
			expected: "image/gif",
		},
		{
			name:     "WEBP mime type",
			fileType: WEBP,
			expected: "image/webp",
		},
		{
			name:     "Unknown mime type",
			fileType: UNKNOWN,
			expected: "application/octet-stream",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Call the function
			result := GetMimeType(tt.fileType)

			// Check the result
			if result != tt.expected {
				t.Errorf("GetMimeType() = %v, want %v", result, tt.expected)
			}
		})
	}
}

// mockMultipartFile は multipart.File インターフェースを実装するモック
type mockMultipartFile struct {
	content []byte
	offset  int64
}

func (m *mockMultipartFile) Read(p []byte) (n int, err error) {
	if m.offset >= int64(len(m.content)) {
		return 0, io.EOF
	}

	n = copy(p, m.content[m.offset:])
	m.offset += int64(n)
	return n, nil
}

func (m *mockMultipartFile) ReadAt(p []byte, off int64) (n int, err error) {
	if off >= int64(len(m.content)) {
		return 0, io.EOF
	}

	n = copy(p, m.content[off:])
	return n, nil
}

func (m *mockMultipartFile) Seek(offset int64, whence int) (int64, error) {
	switch whence {
	case io.SeekStart:
		m.offset = offset
	case io.SeekCurrent:
		m.offset += offset
	case io.SeekEnd:
		m.offset = int64(len(m.content)) + offset
	}
	return m.offset, nil
}

func (m *mockMultipartFile) Close() error {
	return nil
}

// CreateMockMultipartFile はテスト用のmultipart.FileHeaderを作成する
func CreateMockMultipartFile(filename string, content []byte, contentType string) (*multipart.FileHeader, error) {
	header := &multipart.FileHeader{
		Filename: filename,
		Size:     int64(len(content)),
		Header:   make(textproto.MIMEHeader),
	}
	header.Header.Set("Content-Type", contentType)
	return header, nil
}

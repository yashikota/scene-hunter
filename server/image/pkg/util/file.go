package util

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
)

// FileType は対応するファイルタイプを表す
type FileType string

const (
	// JPEG はJPEG画像を表す
	JPEG FileType = "jpeg"
	// PNG はPNG画像を表す
	PNG FileType = "png"
	// GIF はGIF画像を表す
	GIF FileType = "gif"
	// WEBP はWEBP画像を表す
	WEBP FileType = "webp"
	// UNKNOWN は不明なファイルタイプを表す
	UNKNOWN FileType = "unknown"
)

// マジックナンバー定義
var (
	jpegMagic = []byte{0xFF, 0xD8, 0xFF}
	pngMagic  = []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	gifMagic  = []byte{0x47, 0x49, 0x46, 0x38}
	webpMagic = []byte{0x52, 0x49, 0x46, 0x46}
)

// DetectFileType はファイルのマジックナンバーからファイルタイプを検出する
func DetectFileType(file multipart.File) (FileType, error) {
	// ファイルの先頭を読み込む
	header := make([]byte, 12)
	_, err := file.Read(header)
	if err != nil {
		return UNKNOWN, fmt.Errorf("ファイルヘッダーの読み込みに失敗しました: %w", err)
	}

	// ファイルポインタを先頭に戻す
	_, err = file.Seek(0, io.SeekStart)
	if err != nil {
		return UNKNOWN, fmt.Errorf("ファイルポインタのリセットに失敗しました: %w", err)
	}

	// マジックナンバーでファイルタイプを判定
	if bytes.HasPrefix(header, jpegMagic) {
		return JPEG, nil
	}
	if bytes.HasPrefix(header, pngMagic) {
		return PNG, nil
	}
	if bytes.HasPrefix(header, gifMagic) {
		return GIF, nil
	}
	if bytes.HasPrefix(header, webpMagic) {
		return WEBP, nil
	}

	return UNKNOWN, nil
}

// ValidateFileType はファイルタイプが許可されているかどうかを検証する
func ValidateFileType(fileType FileType, allowedTypes []string) bool {
	if fileType == UNKNOWN {
		return false
	}

	for _, allowed := range allowedTypes {
		if string(fileType) == allowed ||
			(fileType == JPEG && (allowed == "jpg" || allowed == "jpeg")) {
			return true
		}
	}

	return false
}

// GetMimeType はファイルタイプからMIMEタイプを取得する
func GetMimeType(fileType FileType) string {
	switch fileType {
	case JPEG:
		return "image/jpeg"
	case PNG:
		return "image/png"
	case GIF:
		return "image/gif"
	case WEBP:
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}

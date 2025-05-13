package util

import (
	"fmt"
	"mime/multipart"
	"path/filepath"
	"strings"

	"github.com/yashikota/scene-hunter/server/image/config"
)

// ValidateImage は画像ファイルを検証する
func ValidateImage(cfg *config.Config, file *multipart.FileHeader) error {
	// ファイルサイズを検証
	maxSize := int64(cfg.Image.MaxSize) * 1024 * 1024 // MB to bytes
	if file.Size > maxSize {
		return NewError(
			ErrorCodeFileTooLarge,
			fmt.Sprintf("ファイルサイズが大きすぎます。最大サイズは %d MB です", cfg.Image.MaxSize),
			nil,
		)
	}

	// ファイル拡張子を検証
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != "" && ext[0] == '.' {
		ext = ext[1:]
	}

	if !cfg.IsSupportedFormat(ext) {
		return NewError(
			ErrorCodeUnsupportedFormat,
			fmt.Sprintf("サポートされていないファイル形式です。サポートされている形式: %s", strings.Join(cfg.Image.Formats, ", ")),
			nil,
		)
	}

	// ファイルを開く
	src, err := file.Open()
	if err != nil {
		return NewError(
			ErrorCodeInternal,
			"ファイルを開けませんでした",
			err,
		)
	}
	defer src.Close()

	// マジックナンバーでファイルタイプを検証
	fileType, err := DetectFileType(src)
	if err != nil {
		return NewError(
			ErrorCodeInternal,
			"ファイルタイプの検出に失敗しました",
			err,
		)
	}

	// ファイルタイプが許可されているか検証
	if !ValidateFileType(fileType, cfg.Image.Formats) {
		return NewError(
			ErrorCodeUnsupportedFormat,
			fmt.Sprintf("不正なファイル形式です。ファイル内容が拡張子と一致しません。検出されたタイプ: %s", fileType),
			nil,
		)
	}

	return nil
}

// ValidatePreset はプリセット名を検証する
func ValidatePreset(cfg *config.Config, preset string) error {
	if preset == "" {
		return nil
	}

	_, err := cfg.GetPresetByName(preset)
	if err != nil {
		return NewError(
			ErrorCodeInvalidRequest,
			fmt.Sprintf("無効なプリセット名です: %s", preset),
			err,
		)
	}

	return nil
}

// ParseMetadata はメタデータ文字列をパースする
func ParseMetadata(metadataStr string) (map[string]interface{}, error) {
	if metadataStr == "" {
		return nil, nil
	}

	// 簡易的なパース（実際にはJSONパースなどを行う）
	metadata := make(map[string]interface{})
	pairs := strings.Split(metadataStr, ",")
	for _, pair := range pairs {
		kv := strings.SplitN(pair, "=", 2)
		if len(kv) == 2 {
			metadata[kv[0]] = kv[1]
		}
	}

	return metadata, nil
}

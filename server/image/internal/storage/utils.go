package storage

import (
	"fmt"
	"regexp"
	"strings"
)

// ValidateBucketName はバケット名が小文字と数字のみで構成されているかチェックする
func ValidateBucketName(bucketName string) error {
	if bucketName == "" {
		return nil // 空の場合はデフォルトバケットを使用するのでエラーにしない
	}

	// 小文字と数字のみで構成されているかチェック
	matched, _ := regexp.MatchString("^[a-z0-9]+$", bucketName)
	if !matched {
		return fmt.Errorf("バケット名は小文字と数字のみで構成する必要があります: %s", bucketName)
	}

	return nil
}

// GetContentType は拡張子からContent-Typeを取得する
func GetContentType(ext string) string {
	switch strings.ToLower(ext) {
	case "jpg", "jpeg":
		return "image/jpeg"
	case "png":
		return "image/png"
	case "gif":
		return "image/gif"
	case "webp":
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}

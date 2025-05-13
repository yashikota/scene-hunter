package model

import (
	"time"
)

// Image は画像モデルを表す
type Image struct {
	ID        string                 `json:"id"`
	Filename  string                 `json:"filename"`
	Size      int64                  `json:"size"`
	Format    string                 `json:"format"`
	Width     int                    `json:"width"`
	Height    int                    `json:"height"`
	Metadata  map[string]interface{} `json:"metadata"`
	URLs      map[string]string      `json:"urls"`
	CreatedAt time.Time              `json:"created_at"`
}

// ImageList は画像一覧レスポンスを表す
type ImageList struct {
	Total  int     `json:"total"`
	Limit  int     `json:"limit"`
	Offset int     `json:"offset"`
	Images []Image `json:"images"`
}

// UploadResponse はアップロードレスポンスを表す
type UploadResponse struct {
	ID        string                 `json:"id"`
	URLs      map[string]string      `json:"urls"`
	Metadata  map[string]interface{} `json:"metadata"`
	CreatedAt time.Time              `json:"created_at"`
}

// ErrorResponse はエラーレスポンスを表す
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
	Code    int    `json:"code"`
}

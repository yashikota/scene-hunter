package transform

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"

	"github.com/yashikota/scene-hunter/server/image/config"
	"golang.org/x/image/draw"
)

// Transformer は画像変換を行うインターフェース
type Transformer interface {
	// Transform は画像を変換する
	Transform(ctx context.Context, reader io.Reader, preset string) (io.Reader, error)

	// GetImageInfo は画像の情報を取得する
	GetImageInfo(ctx context.Context, reader io.Reader) (int, int, string, error)

	// Close は変換リソースを解放する
	Close() error
}

// StandardTransformer は標準ライブラリを使用した画像変換実装
type StandardTransformer struct {
	config *config.Config
}

// NewTransformer は新しい画像変換インスタンスを作成する
func NewTransformer(cfg *config.Config) (Transformer, error) {
	return &StandardTransformer{
		config: cfg,
	}, nil
}

// Transform は画像を変換する
func (t *StandardTransformer) Transform(ctx context.Context, reader io.Reader, presetName string) (io.Reader, error) {
	// プリセットを取得
	preset, err := t.config.GetPresetByName(presetName)
	if err != nil {
		return nil, err
	}

	// オリジナルを保持する場合はそのまま返す
	if preset.PreserveOriginal {
		// readerをコピーして返す
		data, err := io.ReadAll(reader)
		if err != nil {
			return nil, fmt.Errorf("画像データの読み込みに失敗しました: %w", err)
		}
		return bytes.NewReader(data), nil
	}

	// 画像データを読み込む
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("画像データの読み込みに失敗しました: %w", err)
	}

	// 画像を読み込む
	img, format, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("画像のデコードに失敗しました: %w", err)
	}

	// 元のサイズを取得
	bounds := img.Bounds()
	origWidth := bounds.Dx()
	origHeight := bounds.Dy()

	// 新しいサイズを計算
	newWidth, newHeight := calculateDimensions(origWidth, origHeight, preset.Width, preset.Height)

	// リサイズ
	dst := image.NewRGBA(image.Rect(0, 0, newWidth, newHeight))
	draw.CatmullRom.Scale(dst, dst.Rect, img, bounds, draw.Over, nil)

	// 変換後の画像をバッファに書き込む
	buf := new(bytes.Buffer)

	// 入力形式を維持してエンコード
	var encodeErr error
	switch format {
	case "jpeg":
		encodeErr = jpeg.Encode(buf, dst, &jpeg.Options{Quality: preset.Quality})
	case "png":
		encodeErr = png.Encode(buf, dst)
	default:
		// サポートされていない形式の場合はJPEGとしてエンコード
		encodeErr = jpeg.Encode(buf, dst, &jpeg.Options{Quality: preset.Quality})
	}

	if encodeErr != nil {
		return nil, fmt.Errorf("画像のエンコードに失敗しました: %w", encodeErr)
	}

	return bytes.NewReader(buf.Bytes()), nil
}

// GetImageInfo は画像の情報を取得する
func (t *StandardTransformer) GetImageInfo(ctx context.Context, reader io.Reader) (int, int, string, error) {
	// 画像データを読み込む
	data, err := io.ReadAll(reader)
	if err != nil {
		return 0, 0, "", fmt.Errorf("画像データの読み込みに失敗しました: %w", err)
	}

	// 画像を読み込む
	img, format, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return 0, 0, "", fmt.Errorf("画像のデコードに失敗しました: %w", err)
	}

	// 画像の情報を取得
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()

	return width, height, format, nil
}

// Close は変換リソースを解放する
func (t *StandardTransformer) Close() error {
	// 特に何もする必要がない
	return nil
}

// calculateDimensions はアスペクト比を維持しながら新しいサイズを計算する
func calculateDimensions(origWidth, origHeight, maxWidth, maxHeight int) (int, int) {
	if maxWidth == 0 && maxHeight == 0 {
		return origWidth, origHeight
	}

	if maxWidth == 0 {
		// 高さのみ指定された場合
		ratio := float64(maxHeight) / float64(origHeight)
		return int(float64(origWidth) * ratio), maxHeight
	}

	if maxHeight == 0 {
		// 幅のみ指定された場合
		ratio := float64(maxWidth) / float64(origWidth)
		return maxWidth, int(float64(origHeight) * ratio)
	}

	// 幅と高さの両方が指定された場合、アスペクト比を維持する
	widthRatio := float64(maxWidth) / float64(origWidth)
	heightRatio := float64(maxHeight) / float64(origHeight)

	// 小さい方の比率を使用
	ratio := widthRatio
	if heightRatio < widthRatio {
		ratio = heightRatio
	}

	return int(float64(origWidth) * ratio), int(float64(origHeight) * ratio)
}

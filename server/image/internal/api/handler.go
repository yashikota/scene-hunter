package api

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/yashikota/scene-hunter/server/image/config"
	"github.com/yashikota/scene-hunter/server/image/internal/storage"
	"github.com/yashikota/scene-hunter/server/image/internal/transform"
	"github.com/yashikota/scene-hunter/server/image/pkg/model"
	"github.com/yashikota/scene-hunter/server/image/pkg/util"
)

// Handler はAPIハンドラーを表す
type Handler struct {
	Config      *config.Config
	Storage     storage.Storage
	Transformer transform.Transformer
}

// NewHandler は新しいAPIハンドラーを作成する
func NewHandler(cfg *config.Config, s storage.Storage, t transform.Transformer) *Handler {
	return &Handler{
		Config:      cfg,
		Storage:     s,
		Transformer: t,
	}
}

// UploadImage は画像をアップロードする
func (h *Handler) UploadImage(c echo.Context) error {
	// ファイルを取得
	file, err := c.FormFile("file")
	if err != nil {
		return util.NewError(util.ErrorCodeInvalidRequest, "ファイルが見つかりません", err)
	}

	// ファイルを検証
	if err := util.ValidateImage(h.Config, file); err != nil {
		return err
	}

	// メタデータを取得
	metadataStr := c.FormValue("metadata")
	metadata, err := util.ParseMetadata(metadataStr)
	if err != nil {
		return util.NewError(util.ErrorCodeInvalidRequest, "無効なメタデータです", err)
	}

	// 永続/非永続の選択を取得
	isPermanent := true // デフォルトは永続
	isPermanentStr := c.FormValue("is_permanent")
	if isPermanentStr != "" {
		isPermanent, err = strconv.ParseBool(isPermanentStr)
		if err != nil {
			return util.NewError(util.ErrorCodeInvalidRequest, "無効なis_permanent値です", err)
		}
	}

	// カスタムバケット名を取得
	customBucket := c.FormValue("bucket_name")
	if customBucket != "" {
		// バケット名のバリデーション
		if err := storage.ValidateBucketName(customBucket); err != nil {
			return util.NewError(util.ErrorCodeInvalidRequest, "無効なバケット名です", err)
		}
	}

	// 変換プリセットを取得
	transformStr := c.FormValue("transform")
	var presets []string
	if transformStr != "" {
		presets = strings.Split(transformStr, ",")
		for _, preset := range presets {
			if err := util.ValidatePreset(h.Config, preset); err != nil {
				return err
			}
		}
	}

	// IDを生成
	id := uuid.New().String()

	// ファイルを開く
	src, err := file.Open()
	if err != nil {
		return util.NewError(util.ErrorCodeInternal, "ファイルを開けませんでした", err)
	}
	defer src.Close()

	// 画像情報を取得
	width, height, format, err := h.Transformer.GetImageInfo(c.Request().Context(), src)
	if err != nil {
		return util.NewError(util.ErrorCodeInternal, "画像情報の取得に失敗しました", err)
	}

	// ファイルを再度開く（GetImageInfoでReaderが消費されるため）
	src, err = file.Open()
	if err != nil {
		return util.NewError(util.ErrorCodeInternal, "ファイルを開けませんでした", err)
	}
	defer src.Close()

	// メタデータに画像情報を追加
	if metadata == nil {
		metadata = make(map[string]interface{})
	}
	metadata["width"] = width
	metadata["height"] = height
	metadata["format"] = format

	// 画像を変換してからアップロード
	var uploadSrc io.Reader = src

	// 変換プリセットが指定されている場合は変換
	if len(presets) > 0 {
		// 最初のプリセットで変換
		transformedReader, err := h.Transformer.Transform(c.Request().Context(), src, presets[0])
		if err != nil {
			return util.NewError(util.ErrorCodeInternal, "画像の変換に失敗しました", err)
		}
		uploadSrc = transformedReader

		// フォーマット情報を更新（変換後のフォーマットは入力と同じ）
		metadata["format"] = format
	}

	// 画像をアップロード
	info, err := h.Storage.Upload(
		c.Request().Context(),
		id,
		file.Filename,
		uploadSrc,
		metadata,
		isPermanent,
		customBucket,
	)
	if err != nil {
		return util.NewError(util.ErrorCodeInternal, "画像のアップロードに失敗しました", err)
	}

	// URLを生成
	urls := map[string]string{
		"original": fmt.Sprintf("/v1/images/%s", id),
	}

	// プリセットURLを追加
	for _, preset := range presets {
		urls[preset] = fmt.Sprintf("/v1/images/%s?preset=%s", id, preset)
	}

	// レスポンスを返す
	return c.JSON(http.StatusCreated, model.UploadResponse{
		ID:        id,
		URLs:      urls,
		Metadata:  metadata,
		CreatedAt: info.CreatedAt,
	})
}

// GetImage は画像を取得する
func (h *Handler) GetImage(c echo.Context) error {
	// IDを取得
	id := c.Param("id")
	if id == "" {
		return util.NewError(util.ErrorCodeInvalidRequest, "IDが指定されていません", nil)
	}

	// プリセットを取得
	preset := c.QueryParam("preset")
	if preset != "" {
		if err := util.ValidatePreset(h.Config, preset); err != nil {
			return err
		}
	}

	// 画像を取得
	reader, info, err := h.Storage.Get(c.Request().Context(), id)
	if err != nil {
		return util.NewError(util.ErrorCodeNotFound, "画像が見つかりません", err)
	}
	defer reader.Close()

	// プリセットが指定されている場合は変換
	if preset != "" {
		transformedReader, err := h.Transformer.Transform(c.Request().Context(), reader, preset)
		if err != nil {
			return util.NewError(util.ErrorCodeInternal, "画像の変換に失敗しました", err)
		}
		reader = transformedReader.(io.ReadCloser)
	}

	// Content-Typeを設定
	contentType := "application/octet-stream"
	switch strings.ToLower(info.Format) {
	case "jpg", "jpeg":
		contentType = "image/jpeg"
	case "png":
		contentType = "image/png"
	case "gif":
		contentType = "image/gif"
	case "webp":
		contentType = "image/webp"
	}

	// レスポンスヘッダーを設定
	c.Response().Header().Set(echo.HeaderContentType, contentType)
	c.Response().Header().Set(echo.HeaderContentDisposition, fmt.Sprintf("inline; filename=%q", info.Filename))
	c.Response().WriteHeader(http.StatusOK)

	// 画像データを返す
	_, err = io.Copy(c.Response().Writer, reader)
	return err
}

// GetImageMetadata は画像のメタデータを取得する
func (h *Handler) GetImageMetadata(c echo.Context) error {
	// IDを取得
	id := c.Param("id")
	if id == "" {
		return util.NewError(util.ErrorCodeInvalidRequest, "IDが指定されていません", nil)
	}

	// 画像情報を取得
	info, err := h.Storage.GetInfo(c.Request().Context(), id)
	if err != nil {
		return util.NewError(util.ErrorCodeNotFound, "画像が見つかりません", err)
	}

	// レスポンスを返す
	return c.JSON(http.StatusOK, model.Image{
		ID:        info.ID,
		Filename:  info.Filename,
		Size:      info.Size,
		Format:    info.Format,
		Width:     info.Width,
		Height:    info.Height,
		Metadata:  info.Metadata,
		CreatedAt: info.CreatedAt,
	})
}

// ListImages は画像の一覧を取得する
func (h *Handler) ListImages(c echo.Context) error {
	// クエリパラメータを取得
	limitStr := c.QueryParam("limit")
	offsetStr := c.QueryParam("offset")
	sort := c.QueryParam("sort")

	// デフォルト値
	limit := 20
	offset := 0

	// リミットを解析
	if limitStr != "" {
		l, err := strconv.Atoi(limitStr)
		if err != nil {
			return util.NewError(util.ErrorCodeInvalidRequest, "無効なlimit値です", err)
		}
		if l > 0 {
			limit = l
		}
	}

	// オフセットを解析
	if offsetStr != "" {
		o, err := strconv.Atoi(offsetStr)
		if err != nil {
			return util.NewError(util.ErrorCodeInvalidRequest, "無効なoffset値です", err)
		}
		if o >= 0 {
			offset = o
		}
	}

	// 画像一覧を取得
	images, total, err := h.Storage.List(c.Request().Context(), limit, offset, sort)
	if err != nil {
		return util.NewError(util.ErrorCodeInternal, "画像一覧の取得に失敗しました", err)
	}

	// レスポンスを構築
	var imageList []model.Image
	for _, img := range images {
		// URLを生成
		urls := map[string]string{
			"original": fmt.Sprintf("/v1/images/%s", img.ID),
		}

		// プリセットURLを追加
		for _, preset := range h.Config.Transform.Presets {
			urls[preset.Name] = fmt.Sprintf("/v1/images/%s?preset=%s", img.ID, preset.Name)
		}

		imageList = append(imageList, model.Image{
			ID:        img.ID,
			Filename:  img.Filename,
			Size:      img.Size,
			Format:    img.Format,
			Width:     img.Width,
			Height:    img.Height,
			Metadata:  img.Metadata,
			URLs:      urls,
			CreatedAt: img.CreatedAt,
		})
	}

	// レスポンスを返す
	return c.JSON(http.StatusOK, model.ImageList{
		Total:  total,
		Limit:  limit,
		Offset: offset,
		Images: imageList,
	})
}

// DeleteImage は画像を削除する
func (h *Handler) DeleteImage(c echo.Context) error {
	// IDを取得
	id := c.Param("id")
	if id == "" {
		return util.NewError(util.ErrorCodeInvalidRequest, "IDが指定されていません", nil)
	}

	// 画像を削除
	err := h.Storage.Delete(c.Request().Context(), id)
	if err != nil {
		return util.NewError(util.ErrorCodeNotFound, "画像が見つかりません", err)
	}

	// レスポンスを返す
	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "画像を削除しました",
	})
}

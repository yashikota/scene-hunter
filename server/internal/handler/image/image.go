// Package image provides image handling operations.
package image

import (
	"bytes"
	"context"
	"image"
	"image/jpeg"
	"io"
	"path/filepath"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/anthonynsimon/bild/transform"
	"github.com/google/uuid"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	domainimage "github.com/yashikota/scene-hunter/server/internal/domain/image"
	"github.com/yashikota/scene-hunter/server/internal/infra/blob"
	"github.com/yashikota/scene-hunter/server/internal/infra/kvs"
	"github.com/yashikota/scene-hunter/server/internal/repository"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
	"google.golang.org/protobuf/types/known/timestamppb"

	_ "image/gif"
	_ "image/png"

	_ "golang.org/x/image/webp"
)

// ErrRoomNotFound is returned when the room is not found.
var ErrRoomNotFound = errors.New("room not found")

// ErrImageNotFound is returned when the image is not found.
var ErrImageNotFound = errors.New("image not found")

// TTL は画像の有効期限（1時間）.
const TTL = 1 * time.Hour

// ImageHandler handles image operations with infrastructure dependencies.
type ImageHandler struct {
	blobClient blob.Blob
	kvsClient  kvs.KVS
	roomRepo   repository.RoomRepository
}

// NewImageHandler creates a new image handler.
func NewImageHandler(
	blobClient blob.Blob,
	kvsClient kvs.KVS,
	roomRepo repository.RoomRepository,
) *ImageHandler {
	return &ImageHandler{
		blobClient: blobClient,
		kvsClient:  kvsClient,
		roomRepo:   roomRepo,
	}
}

// UploadImage handles image upload with blob storage.
func (h *ImageHandler) UploadImage(
	ctx context.Context,
	req *connect.Request[scene_hunterv1.UploadImageRequest],
) (*connect.Response[scene_hunterv1.UploadImageResponse], error) {
	// room codeからroomを取得
	roomCodeKey := "room_code:" + req.Msg.GetRoomCode()

	roomIDStr, err := h.kvsClient.Get(ctx, roomCodeKey)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeNotFound,
			errors.Errorf("%w: code=%s", ErrRoomNotFound, req.Msg.GetRoomCode()),
		)
	}

	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			errors.Errorf("invalid room ID: %w", err),
		)
	}

	// 画像データの作成とバリデーション
	img, err := domainimage.NewImage(
		req.Msg.GetRoomCode(),
		req.Msg.GetContentType(),
		req.Msg.GetImageData(),
	)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.Errorf("invalid image data: %w", err),
		)
	}

	// RustFSに保存（roomIDベースのパスを使用）
	path := domainimage.PathFromRoomID(roomID, img.ID, img.ContentType)

	err = h.blobClient.Put(ctx, path, img.Reader(), TTL)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			errors.Errorf("failed to save image: %w", err),
		)
	}

	// レスポンス生成
	return connect.NewResponse(&scene_hunterv1.UploadImageResponse{
		ImageId:   img.ID.String(),
		ImagePath: path,
	}), nil
}

// GetImage retrieves an image from blob storage.
func (h *ImageHandler) GetImage(
	ctx context.Context,
	req *connect.Request[scene_hunterv1.GetImageRequest],
) (*connect.Response[scene_hunterv1.GetImageResponse], error) {
	// Parse UUIDs
	roomID, err := uuid.Parse(req.Msg.GetRoomId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.Errorf("invalid room ID: %w", err),
		)
	}

	imageID, err := uuid.Parse(req.Msg.GetImageId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.Errorf("invalid image ID: %w", err),
		)
	}

	// room IDの存在確認
	exists, err := h.roomRepo.Exists(ctx, roomID)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			errors.Errorf("failed to check room existence: %w", err),
		)
	}

	if !exists {
		return nil, connect.NewError(
			connect.CodeNotFound,
			errors.Errorf("%w: id=%s", ErrRoomNotFound, roomID),
		)
	}

	// 画像のパスを構築 (各contentTypeを試す)
	var (
		imageData   []byte
		contentType string
	)

	supportedTypes := []string{"image/jpeg", "image/png", "image/webp"}

	for _, candidateType := range supportedTypes {
		path := domainimage.PathFromRoomID(roomID, imageID, candidateType)

		reader, err := h.blobClient.Get(ctx, path)
		if err != nil {
			continue
		}

		defer func() {
			_ = reader.Close()
		}()

		data, err := io.ReadAll(reader)
		if err != nil {
			continue
		}

		imageData = data
		contentType = candidateType

		break
	}

	if imageData == nil {
		return nil, connect.NewError(
			connect.CodeNotFound,
			errors.Errorf("%w: id=%s", ErrImageNotFound, imageID),
		)
	}

	return connect.NewResponse(&scene_hunterv1.GetImageResponse{
		ImageData:   imageData,
		ContentType: contentType,
	}), nil
}

// ListImages lists all images in a room from blob storage.
func (h *ImageHandler) ListImages(
	ctx context.Context,
	req *connect.Request[scene_hunterv1.ListImagesRequest],
) (*connect.Response[scene_hunterv1.ListImagesResponse], error) {
	// Parse UUID
	roomID, err := uuid.Parse(req.Msg.GetRoomId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.Errorf("invalid room ID: %w", err),
		)
	}

	// room IDの存在確認
	exists, err := h.roomRepo.Exists(ctx, roomID)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			errors.Errorf("failed to check room existence: %w", err),
		)
	}

	if !exists {
		return nil, connect.NewError(
			connect.CodeNotFound,
			errors.Errorf("%w: id=%s", ErrRoomNotFound, roomID),
		)
	}

	// roomIDをprefixにして画像一覧を取得
	prefix := filepath.Join("game", roomID.String())

	objects, err := h.blobClient.List(ctx, prefix)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			errors.Errorf("failed to list images: %w", err),
		)
	}

	// レスポンスを構築
	images := make([]*scene_hunterv1.ImageInfo, 0, len(objects))

	for _, obj := range objects {
		// パスからimageIDを抽出
		filename := filepath.Base(obj.Key)
		imageIDStr := strings.TrimSuffix(filename, filepath.Ext(filename))

		imageID, err := uuid.Parse(imageIDStr)
		if err != nil {
			// 不正なファイル名はスキップ
			continue
		}

		images = append(images, &scene_hunterv1.ImageInfo{
			ImageId:      imageID.String(),
			ImagePath:    obj.Key,
			Size:         obj.Size,
			LastModified: timestamppb.New(obj.LastModified),
		})
	}

	return connect.NewResponse(&scene_hunterv1.ListImagesResponse{
		Images: images,
	}), nil
}

// ListImageThumbnails lists all images in a room as thumbnails from blob storage.
func (h *ImageHandler) ListImageThumbnails(
	ctx context.Context,
	req *connect.Request[scene_hunterv1.ListImageThumbnailsRequest],
) (*connect.Response[scene_hunterv1.ListImageThumbnailsResponse], error) {
	// Parse UUID
	roomID, err := uuid.Parse(req.Msg.GetRoomId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.Errorf("invalid room ID: %w", err),
		)
	}

	// room IDの存在確認
	exists, err := h.roomRepo.Exists(ctx, roomID)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			errors.Errorf("failed to check room existence: %w", err),
		)
	}

	if !exists {
		return nil, connect.NewError(
			connect.CodeNotFound,
			errors.Errorf("%w: id=%s", ErrRoomNotFound, roomID),
		)
	}

	// roomIDをprefixにして画像一覧を取得
	prefix := filepath.Join("game", roomID.String())

	objects, err := h.blobClient.List(ctx, prefix)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			errors.Errorf("failed to list images: %w", err),
		)
	}

	// レスポンスを構築
	thumbnails := make([]*scene_hunterv1.ThumbnailInfo, 0, len(objects))

	for _, obj := range objects {
		// パスからimageIDを抽出
		filename := filepath.Base(obj.Key)
		imageIDStr := strings.TrimSuffix(filename, filepath.Ext(filename))

		imageID, err := uuid.Parse(imageIDStr)
		if err != nil {
			// 不正なファイル名はスキップ
			continue
		}

		// 画像を取得
		reader, err := h.blobClient.Get(ctx, obj.Key)
		if err != nil {
			// エラーが発生した場合はスキップ
			continue
		}

		imageData, err := io.ReadAll(reader)
		_ = reader.Close()

		if err != nil {
			continue
		}

		// サムネイルを生成
		thumbnailData, err := generateThumbnail(imageData)
		if err != nil {
			// サムネイル生成に失敗した場合はスキップ
			continue
		}

		thumbnails = append(thumbnails, &scene_hunterv1.ThumbnailInfo{
			ImageId:       imageID.String(),
			ThumbnailData: thumbnailData,
			ContentType:   "image/jpeg",
		})
	}

	return connect.NewResponse(&scene_hunterv1.ListImageThumbnailsResponse{
		Thumbnails: thumbnails,
	}), nil
}

const (
	// ThumbnailMaxSize はサムネイルの最大幅（ピクセル）.
	ThumbnailMaxSize = 540
	// JPEGQuality はJPEG圧縮の品質（75%）.
	JPEGQuality = 75
)

// generateThumbnail generates a thumbnail from image data.
func generateThumbnail(imageData []byte) ([]byte, error) {
	// 画像をデコード
	img, _, err := image.Decode(bytes.NewReader(imageData))
	if err != nil {
		return nil, errors.Errorf("failed to decode image: %w", err)
	}

	// 元の画像サイズを取得
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()

	// サムネイルサイズを計算（アスペクト比を維持）
	var thumbnailWidth, thumbnailHeight int

	if width > height {
		thumbnailWidth = ThumbnailMaxSize
		thumbnailHeight = (height * ThumbnailMaxSize) / width
	} else {
		thumbnailHeight = ThumbnailMaxSize
		thumbnailWidth = (width * ThumbnailMaxSize) / height
	}

	// 既に小さい画像の場合はリサイズしない
	if width <= ThumbnailMaxSize && height <= ThumbnailMaxSize {
		thumbnailWidth = width
		thumbnailHeight = height
	}

	// リサイズ
	resized := transform.Resize(img, thumbnailWidth, thumbnailHeight, transform.Linear)

	// JPEGにエンコード
	var buf bytes.Buffer

	err = jpeg.Encode(&buf, resized, &jpeg.Options{Quality: JPEGQuality})
	if err != nil {
		return nil, errors.Errorf("failed to encode thumbnail: %w", err)
	}

	return buf.Bytes(), nil
}

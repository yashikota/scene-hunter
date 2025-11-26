// Package image provides image service implementation.
package image

import (
	"context"
	"io"
	"path/filepath"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	domainimage "github.com/yashikota/scene-hunter/server/internal/domain/image"
	"github.com/yashikota/scene-hunter/server/internal/service"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// ErrRoomNotFound is returned when the room is not found.
var ErrRoomNotFound = errors.New("room not found")

// ErrImageNotFound is returned when the image is not found.
var ErrImageNotFound = errors.New("image not found")

// TTL は画像の有効期限（1時間）.
const TTL = 1 * time.Hour

type Service struct {
	blobClient service.Blob
	kvsClient  service.KVS
	roomRepo   service.RoomRepository
}

func NewService(
	blobClient service.Blob,
	kvsClient service.KVS,
	roomRepo service.RoomRepository,
) *Service {
	return &Service{
		blobClient: blobClient,
		kvsClient:  kvsClient,
		roomRepo:   roomRepo,
	}
}

func (s *Service) UploadImage(
	ctx context.Context,
	req *scene_hunterv1.UploadImageRequest,
) (*scene_hunterv1.UploadImageResponse, error) {
	// room codeからroomを取得
	roomCodeKey := "room_code:" + req.GetRoomCode()

	roomIDStr, err := s.kvsClient.Get(ctx, roomCodeKey)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeNotFound,
			errors.Errorf("%w: code=%s", ErrRoomNotFound, req.GetRoomCode()),
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
		req.GetRoomCode(),
		req.GetContentType(),
		req.GetImageData(),
	)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.Errorf("invalid image data: %w", err),
		)
	}

	// RustFSに保存（roomIDベースのパスを使用）
	path := domainimage.PathFromRoomID(roomID, img.ID, img.ContentType)

	err = s.blobClient.Put(ctx, path, img.Reader(), TTL)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			errors.Errorf("failed to save image: %w", err),
		)
	}

	// レスポンス生成
	return &scene_hunterv1.UploadImageResponse{
		ImageId:   img.ID.String(),
		ImagePath: path,
	}, nil
}

func (s *Service) GetImage(
	ctx context.Context,
	req *scene_hunterv1.GetImageRequest,
) (*scene_hunterv1.GetImageResponse, error) {
	// Parse UUIDs
	roomID, err := uuid.Parse(req.GetRoomId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.Errorf("invalid room ID: %w", err),
		)
	}

	imageID, err := uuid.Parse(req.GetImageId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.Errorf("invalid image ID: %w", err),
		)
	}

	// room IDの存在確認
	exists, err := s.roomRepo.Exists(ctx, roomID)
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

		reader, err := s.blobClient.Get(ctx, path)
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

	return &scene_hunterv1.GetImageResponse{
		ImageData:   imageData,
		ContentType: contentType,
	}, nil
}

func (s *Service) ListImages(
	ctx context.Context,
	req *scene_hunterv1.ListImagesRequest,
) (*scene_hunterv1.ListImagesResponse, error) {
	// Parse UUID
	roomID, err := uuid.Parse(req.GetRoomId())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.Errorf("invalid room ID: %w", err),
		)
	}

	// room IDの存在確認
	exists, err := s.roomRepo.Exists(ctx, roomID)
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

	objects, err := s.blobClient.List(ctx, prefix)
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

	return &scene_hunterv1.ListImagesResponse{
		Images: images,
	}, nil
}

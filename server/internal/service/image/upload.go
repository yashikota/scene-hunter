// Package image provides image service implementation.
package image

import (
	"context"
	"errors"
	"fmt"
	"time"

	"connectrpc.com/connect"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	domainblob "github.com/yashikota/scene-hunter/server/internal/domain/blob"
	domainimage "github.com/yashikota/scene-hunter/server/internal/domain/image"
	domainkvs "github.com/yashikota/scene-hunter/server/internal/domain/kvs"
)

// ErrRoomNotFound is returned when the room is not found.
var ErrRoomNotFound = errors.New("room not found")

// TTL は画像の有効期限（1時間）.
const TTL = 1 * time.Hour

type Service struct {
	blobClient domainblob.Blob
	kvsClient  domainkvs.KVS
}

func NewService(blobClient domainblob.Blob, kvsClient domainkvs.KVS) *Service {
	return &Service{
		blobClient: blobClient,
		kvsClient:  kvsClient,
	}
}

func (s *Service) UploadImage(
	ctx context.Context,
	req *scene_hunterv1.UploadImageRequest,
) (*scene_hunterv1.UploadImageResponse, error) {
	// room codeの存在確認
	exists, err := s.kvsClient.Exists(ctx, req.GetRoomCode())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			fmt.Errorf("failed to check room existence: %w", err),
		)
	}

	if !exists {
		return nil, connect.NewError(
			connect.CodeNotFound,
			fmt.Errorf("%w: code=%s", ErrRoomNotFound, req.GetRoomCode()),
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
			fmt.Errorf("invalid image data: %w", err),
		)
	}

	// RustFSに保存
	path := img.Path()

	err = s.blobClient.Put(ctx, path, img.Reader(), TTL)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			fmt.Errorf("failed to save image: %w", err),
		)
	}

	// レスポンス生成
	return &scene_hunterv1.UploadImageResponse{
		ImageId:   img.ID.String(),
		ImagePath: path,
	}, nil
}

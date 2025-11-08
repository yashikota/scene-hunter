package image

import (
	"context"
	"time"

	"connectrpc.com/connect"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	domainblob "github.com/yashikota/scene-hunter/server/internal/domain/blob"
	domainimage "github.com/yashikota/scene-hunter/server/internal/domain/image"
	domainkvs "github.com/yashikota/scene-hunter/server/internal/domain/kvs"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

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
	exists, err := s.kvsClient.Exists(ctx, req.GetRoomCode())
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			errors.Errorf("failed to check room existence: %w", err),
		)
	}

	if !exists {
		return nil, connect.NewError(
			connect.CodeNotFound,
			errors.Errorf("%w: code=%s", ErrRoomNotFound, req.GetRoomCode()),
		)
	}

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

	path := img.Path()

	err = s.blobClient.Put(ctx, path, img.Reader(), TTL)
	if err != nil {
		return nil, connect.NewError(
			connect.CodeInternal,
			errors.Errorf("failed to save image: %w", err),
		)
	}

	return &scene_hunterv1.UploadImageResponse{
		ImageId:   img.ID.String(),
		ImagePath: path,
	}, nil
}

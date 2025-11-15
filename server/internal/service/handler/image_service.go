package handler

import (
	"context"

	"connectrpc.com/connect"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	imagehandler "github.com/yashikota/scene-hunter/server/internal/handler/image"
	"github.com/yashikota/scene-hunter/server/internal/infra/blob"
	"github.com/yashikota/scene-hunter/server/internal/infra/kvs"
	"github.com/yashikota/scene-hunter/server/internal/repository"
)

// ImageService implements Connect RPC ImageService interface with handler support.
type ImageService struct {
	handler *imagehandler.ImageHandler
}

// NewImageService creates a new image service with handler support.
func NewImageService(
	blobClient blob.Blob,
	kvsClient kvs.KVS,
	roomRepo repository.RoomRepository,
) *ImageService {
	return &ImageService{
		handler: imagehandler.NewImageHandler(blobClient, kvsClient, roomRepo),
	}
}

// UploadImage uploads an image to blob storage.
func (s *ImageService) UploadImage(
	ctx context.Context,
	req *scene_hunterv1.UploadImageRequest,
) (*scene_hunterv1.UploadImageResponse, error) {
	resp, err := s.handler.UploadImage(ctx, connect.NewRequest(req))
	if err != nil {
		//nolint:wrapcheck // service delegates to handler, error wrapping done in handler layer
		return nil, err
	}

	return resp.Msg, nil
}

// GetImage retrieves an image from blob storage.
func (s *ImageService) GetImage(
	ctx context.Context,
	req *scene_hunterv1.GetImageRequest,
) (*scene_hunterv1.GetImageResponse, error) {
	resp, err := s.handler.GetImage(ctx, connect.NewRequest(req))
	if err != nil {
		//nolint:wrapcheck // service delegates to handler, error wrapping done in handler layer
		return nil, err
	}

	return resp.Msg, nil
}

// ListImages lists all images in a room.
func (s *ImageService) ListImages(
	ctx context.Context,
	req *scene_hunterv1.ListImagesRequest,
) (*scene_hunterv1.ListImagesResponse, error) {
	resp, err := s.handler.ListImages(ctx, connect.NewRequest(req))
	if err != nil {
		//nolint:wrapcheck // service delegates to handler, error wrapping done in handler layer
		return nil, err
	}

	return resp.Msg, nil
}

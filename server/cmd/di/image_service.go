package di

import (
	"context"

	"connectrpc.com/connect"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	imagehandler "github.com/yashikota/scene-hunter/server/internal/handler/image"
	"github.com/yashikota/scene-hunter/server/internal/service"
)

// imageServiceHandler implements Connect RPC ImageService interface with handler support.
type imageServiceHandler struct {
	handler *imagehandler.ImageHandler
}

// newImageServiceHandler creates a new image service with handler support.
func newImageServiceHandler(
	blobClient service.Blob,
	kvsClient service.KVS,
	roomRepo service.RoomRepository,
) *imageServiceHandler {
	return &imageServiceHandler{
		handler: imagehandler.NewImageHandler(blobClient, kvsClient, roomRepo),
	}
}

// UploadImage uploads an image to blob storage.
func (s *imageServiceHandler) UploadImage(
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
func (s *imageServiceHandler) GetImage(
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
func (s *imageServiceHandler) ListImages(
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

// ListImageThumbnails lists all images in a room as thumbnails.
func (s *imageServiceHandler) ListImageThumbnails(
	ctx context.Context,
	req *scene_hunterv1.ListImageThumbnailsRequest,
) (*scene_hunterv1.ListImageThumbnailsResponse, error) {
	resp, err := s.handler.ListImageThumbnails(ctx, connect.NewRequest(req))
	if err != nil {
		//nolint:wrapcheck // service delegates to handler, error wrapping done in handler layer
		return nil, err
	}

	return resp.Msg, nil
}

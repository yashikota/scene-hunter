package image_test

import (
	"bytes"
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/testcontainers/testcontainers-go/modules/minio"
	"github.com/testcontainers/testcontainers-go/modules/valkey"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	domainroom "github.com/yashikota/scene-hunter/server/internal/domain/room"
	infrablob "github.com/yashikota/scene-hunter/server/internal/infra/blob"
	infrakvs "github.com/yashikota/scene-hunter/server/internal/infra/kvs"
	"github.com/yashikota/scene-hunter/server/internal/repository"
	"github.com/yashikota/scene-hunter/server/internal/service"
	"github.com/yashikota/scene-hunter/server/internal/service/image"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// 以下のテストはサービス層の統合テストであり、各テストが異なるシナリオを検証するため、
// テーブル駆動テストではなく個別の関数として実装している。

// setupMinio はテスト用のMinIOコンテナをセットアップする.
func setupMinio(ctx context.Context, t *testing.T) (service.Blob, func()) {
	t.Helper()

	minioContainer, err := minio.Run(ctx, "docker.io/minio/minio:RELEASE.2025-09-07T16-13-09Z")
	if err != nil {
		t.Fatalf("failed to start minio container: %v", err)
	}

	connString, err := minioContainer.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("failed to get connection string: %v", err)
	}

	var client service.Blob
	for range 10 {
		client, err = infrablob.NewClient(
			connString,
			"minioadmin",
			"minioadmin",
			"test-bucket",
			false,
		)
		if err == nil {
			err = client.Ping(ctx)
			if err == nil {
				break
			}
		}

		time.Sleep(1 * time.Second)
	}

	if err != nil {
		_ = minioContainer.Terminate(ctx)

		t.Fatalf("failed to initialize minio: %v", err)
	}

	cleanup := func() {
		if err := minioContainer.Terminate(ctx); err != nil {
			t.Logf("failed to terminate container: %v", err)
		}
	}

	return client, cleanup
}

// setupValkey はテスト用のValkeyコンテナをセットアップする.
func setupValkey(ctx context.Context, t *testing.T) (service.KVS, func()) {
	t.Helper()

	valkeyContainer, err := valkey.Run(ctx, "docker.io/valkey/valkey:9.0.0")
	if err != nil {
		t.Fatalf("failed to start valkey container: %v", err)
	}

	addr, err := valkeyContainer.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("failed to get connection string: %v", err)
	}

	kvsClient, err := infrakvs.NewClient(addr, "")
	if err != nil {
		_ = valkeyContainer.Terminate(ctx)

		t.Fatalf("failed to create kvs client: %v", err)
	}

	err = kvsClient.Ping(ctx)
	if err != nil {
		_ = valkeyContainer.Terminate(ctx)

		t.Fatalf("KVS ping failed: %v", err)
	}

	cleanup := func() {
		kvsClient.Close()

		if err := valkeyContainer.Terminate(ctx); err != nil {
			t.Logf("failed to terminate container: %v", err)
		}
	}

	return kvsClient, cleanup
}

// TestGetImage_Success は画像取得が正常に動作することをテストする.
func TestGetImage_Success(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	blobClient, blobCleanup := setupMinio(ctx, t)
	defer blobCleanup()

	kvsClient, kvsCleanup := setupValkey(ctx, t)
	defer kvsCleanup()

	roomRepo := repository.NewRoomRepository(kvsClient)

	// テストデータの準備
	roomID := uuid.New()
	adminID := uuid.New()
	room := domainroom.NewRoom("123456", adminID)
	room.ID = roomID

	err := roomRepo.Create(ctx, room)
	if err != nil {
		t.Fatalf("failed to create room: %v", err)
	}

	imageID := uuid.New()
	imageData := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01}
	imagePath := "game/" + roomID.String() + "/" + imageID.String() + ".jpg"

	err = blobClient.Put(ctx, imagePath, bytes.NewReader(imageData), 0)
	if err != nil {
		t.Fatalf("failed to put image: %v", err)
	}

	// サービスの作成とテスト
	svc := image.NewService(blobClient, kvsClient, roomRepo)
	req := &scene_hunterv1.GetImageRequest{
		RoomId:  roomID.String(),
		ImageId: imageID.String(),
	}

	resp, err := svc.GetImage(ctx, req)
	if err != nil {
		t.Fatalf("GetImage() failed: %v", err)
	}

	if resp.GetContentType() != "image/jpeg" {
		t.Errorf("GetImage() content_type = %s, want %s", resp.GetContentType(), "image/jpeg")
	}

	if !bytes.Equal(resp.GetImageData(), imageData) {
		t.Error("GetImage() returned different image data")
	}
}

// TestGetImage_RoomNotFound はルームが存在しない場合のエラーをテストする.
func TestGetImage_RoomNotFound(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	blobClient, blobCleanup := setupMinio(ctx, t)
	defer blobCleanup()

	kvsClient, kvsCleanup := setupValkey(ctx, t)
	defer kvsCleanup()

	roomRepo := repository.NewRoomRepository(kvsClient)

	svc := image.NewService(blobClient, kvsClient, roomRepo)
	req := &scene_hunterv1.GetImageRequest{
		RoomId:  uuid.New().String(),
		ImageId: uuid.New().String(),
	}

	_, err := svc.GetImage(ctx, req)
	if err == nil {
		t.Fatal("GetImage() should fail when room not found")
	}

	var connectErr *connect.Error
	if !errors.As(err, &connectErr) {
		t.Fatal("error should be connect.Error")
	}

	if connectErr.Code() != connect.CodeNotFound {
		t.Errorf("GetImage() error code = %v, want %v", connectErr.Code(), connect.CodeNotFound)
	}
}

// TestGetImage_ImageNotFound は画像が存在しない場合のエラーをテストする.
func TestGetImage_ImageNotFound(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	blobClient, blobCleanup := setupMinio(ctx, t)
	defer blobCleanup()

	kvsClient, kvsCleanup := setupValkey(ctx, t)
	defer kvsCleanup()

	roomRepo := repository.NewRoomRepository(kvsClient)

	// ルームは存在する
	roomID := uuid.New()
	adminID := uuid.New()
	room := domainroom.NewRoom("123456", adminID)
	room.ID = roomID

	err := roomRepo.Create(ctx, room)
	if err != nil {
		t.Fatalf("failed to create room: %v", err)
	}

	svc := image.NewService(blobClient, kvsClient, roomRepo)
	req := &scene_hunterv1.GetImageRequest{
		RoomId:  roomID.String(),
		ImageId: uuid.New().String(),
	}

	_, err = svc.GetImage(ctx, req)
	if err == nil {
		t.Fatal("GetImage() should fail when image not found")
	}

	var connectErr *connect.Error
	if !errors.As(err, &connectErr) {
		t.Fatal("error should be connect.Error")
	}

	if connectErr.Code() != connect.CodeNotFound {
		t.Errorf("GetImage() error code = %v, want %v", connectErr.Code(), connect.CodeNotFound)
	}
}

// TestListImages_Success は画像一覧取得が正常に動作することをテストする.
func TestListImages_Success(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	blobClient, blobCleanup := setupMinio(ctx, t)
	defer blobCleanup()

	kvsClient, kvsCleanup := setupValkey(ctx, t)
	defer kvsCleanup()

	roomRepo := repository.NewRoomRepository(kvsClient)

	// テストデータの準備
	roomID := uuid.New()
	adminID := uuid.New()
	room := domainroom.NewRoom("123456", adminID)
	room.ID = roomID

	err := roomRepo.Create(ctx, room)
	if err != nil {
		t.Fatalf("failed to create room: %v", err)
	}

	// 複数の画像を保存
	imageIDs := []uuid.UUID{uuid.New(), uuid.New()}

	for _, imageID := range imageIDs {
		imagePath := "game/" + roomID.String() + "/" + imageID.String() + ".jpg"
		imageData := []byte{0xFF, 0xD8, 0xFF, 0xE0}

		err = blobClient.Put(ctx, imagePath, bytes.NewReader(imageData), 0)
		if err != nil {
			t.Fatalf("failed to put image: %v", err)
		}
	}

	// サービスの作成とテスト
	svc := image.NewService(blobClient, kvsClient, roomRepo)
	req := &scene_hunterv1.ListImagesRequest{
		RoomId: roomID.String(),
	}

	resp, err := svc.ListImages(ctx, req)
	if err != nil {
		t.Fatalf("ListImages() failed: %v", err)
	}

	if len(resp.GetImages()) != len(imageIDs) {
		t.Errorf("ListImages() returned %d images, want %d", len(resp.GetImages()), len(imageIDs))
	}

	for _, img := range resp.GetImages() {
		if img.GetImageId() == "" {
			t.Error("ListImages() returned image with empty ID")
		}

		if img.GetImagePath() == "" {
			t.Error("ListImages() returned image with empty path")
		}

		if img.GetSize() == 0 {
			t.Error("ListImages() returned image with zero size")
		}

		if img.GetLastModified() == nil {
			t.Error("ListImages() returned image with nil LastModified")
		}
	}
}

// TestListImages_EmptyResult は画像が存在しない場合の空配列レスポンスをテストする.
func TestListImages_EmptyResult(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	blobClient, blobCleanup := setupMinio(ctx, t)
	defer blobCleanup()

	kvsClient, kvsCleanup := setupValkey(ctx, t)
	defer kvsCleanup()

	roomRepo := repository.NewRoomRepository(kvsClient)

	// ルームは存在するが画像は存在しない
	roomID := uuid.New()
	adminID := uuid.New()
	room := domainroom.NewRoom("123456", adminID)
	room.ID = roomID

	err := roomRepo.Create(ctx, room)
	if err != nil {
		t.Fatalf("failed to create room: %v", err)
	}

	svc := image.NewService(blobClient, kvsClient, roomRepo)
	req := &scene_hunterv1.ListImagesRequest{
		RoomId: roomID.String(),
	}

	resp, err := svc.ListImages(ctx, req)
	if err != nil {
		t.Fatalf("ListImages() failed: %v", err)
	}

	if len(resp.GetImages()) != 0 {
		t.Errorf("ListImages() returned %d images, want 0", len(resp.GetImages()))
	}
}

// TestListImages_RoomNotFound はルームが存在しない場合のエラーをテストする.
func TestListImages_RoomNotFound(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	blobClient, blobCleanup := setupMinio(ctx, t)
	defer blobCleanup()

	kvsClient, kvsCleanup := setupValkey(ctx, t)
	defer kvsCleanup()

	roomRepo := repository.NewRoomRepository(kvsClient)

	svc := image.NewService(blobClient, kvsClient, roomRepo)
	req := &scene_hunterv1.ListImagesRequest{
		RoomId: uuid.New().String(),
	}

	_, err := svc.ListImages(ctx, req)
	if err == nil {
		t.Fatal("ListImages() should fail when room not found")
	}

	var connectErr *connect.Error
	if !errors.As(err, &connectErr) {
		t.Fatal("error should be connect.Error")
	}

	if connectErr.Code() != connect.CodeNotFound {
		t.Errorf("ListImages() error code = %v, want %v", connectErr.Code(), connect.CodeNotFound)
	}
}

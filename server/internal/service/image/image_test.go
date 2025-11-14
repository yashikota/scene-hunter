package image_test

import (
	"bytes"
	"context"
	"io"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	domainblob "github.com/yashikota/scene-hunter/server/internal/domain/blob"
	domainroom "github.com/yashikota/scene-hunter/server/internal/domain/room"
	"github.com/yashikota/scene-hunter/server/internal/service/image"
)

// mockBlobClient はBlobインターフェースのモック実装.
type mockBlobClient struct {
	objects map[string][]byte
}

func newMockBlobClient() *mockBlobClient {
	return &mockBlobClient{
		objects: make(map[string][]byte),
	}
}

func (m *mockBlobClient) Ping(_ context.Context) error {
	return nil
}

func (m *mockBlobClient) Put(_ context.Context, key string, data io.Reader, _ time.Duration) error {
	content, err := io.ReadAll(data)
	if err != nil {
		return err
	}

	m.objects[key] = content

	return nil
}

func (m *mockBlobClient) Get(_ context.Context, key string) (io.ReadCloser, error) {
	data, exists := m.objects[key]
	if !exists {
		return nil, connect.NewError(connect.CodeNotFound, nil)
	}

	return io.NopCloser(bytes.NewReader(data)), nil
}

func (m *mockBlobClient) Delete(_ context.Context, key string) error {
	delete(m.objects, key)

	return nil
}

func (m *mockBlobClient) Exists(_ context.Context, key string) (bool, error) {
	_, exists := m.objects[key]

	return exists, nil
}

func (m *mockBlobClient) List(_ context.Context, prefix string) ([]domainblob.ObjectInfo, error) {
	result := []domainblob.ObjectInfo{}

	for key, data := range m.objects {
		if len(prefix) == 0 || len(key) >= len(prefix) && key[:len(prefix)] == prefix {
			result = append(result, domainblob.ObjectInfo{
				Key:          key,
				Size:         int64(len(data)),
				LastModified: time.Now(),
			})
		}
	}

	return result, nil
}

// mockKVSClient はKVSインターフェースのモック実装.
type mockKVSClient struct {
	data map[string]string
}

func newMockKVSClient() *mockKVSClient {
	return &mockKVSClient{
		data: make(map[string]string),
	}
}

func (m *mockKVSClient) Ping(_ context.Context) error {
	return nil
}

func (m *mockKVSClient) Close() {}

func (m *mockKVSClient) Get(_ context.Context, key string) (string, error) {
	value, exists := m.data[key]
	if !exists {
		return "", connect.NewError(connect.CodeNotFound, nil)
	}

	return value, nil
}

func (m *mockKVSClient) Set(_ context.Context, key string, value string, _ time.Duration) error {
	m.data[key] = value

	return nil
}

func (m *mockKVSClient) SetNX(_ context.Context, key string, value string, _ time.Duration) (bool, error) {
	if _, exists := m.data[key]; exists {
		return false, nil
	}

	m.data[key] = value

	return true, nil
}

func (m *mockKVSClient) Delete(_ context.Context, key string) error {
	delete(m.data, key)

	return nil
}

func (m *mockKVSClient) Exists(_ context.Context, key string) (bool, error) {
	_, exists := m.data[key]

	return exists, nil
}

// mockRoomRepository はRoomRepositoryインターフェースのモック実装.
type mockRoomRepository struct {
	rooms map[uuid.UUID]*domainroom.Room
}

func newMockRoomRepository() *mockRoomRepository {
	return &mockRoomRepository{
		rooms: make(map[uuid.UUID]*domainroom.Room),
	}
}

func (m *mockRoomRepository) Create(_ context.Context, room *domainroom.Room) error {
	m.rooms[room.ID] = room

	return nil
}

func (m *mockRoomRepository) Get(_ context.Context, id uuid.UUID) (*domainroom.Room, error) {
	room, exists := m.rooms[id]
	if !exists {
		return nil, domainroom.ErrRoomNotFound
	}

	return room, nil
}

func (m *mockRoomRepository) Update(_ context.Context, room *domainroom.Room) error {
	m.rooms[room.ID] = room

	return nil
}

func (m *mockRoomRepository) Delete(_ context.Context, id uuid.UUID) error {
	delete(m.rooms, id)

	return nil
}

func (m *mockRoomRepository) Exists(_ context.Context, id uuid.UUID) (bool, error) {
	_, exists := m.rooms[id]

	return exists, nil
}

// TestGetImage_Success は画像取得が正常に動作することをテストする.
func TestGetImage_Success(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	blobClient := newMockBlobClient()
	kvsClient := newMockKVSClient()
	roomRepo := newMockRoomRepository()

	// テストデータの準備
	roomID := uuid.New()
	room := domainroom.NewRoom("123456")
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

	if resp.ContentType != "image/jpeg" {
		t.Errorf("GetImage() content_type = %s, want %s", resp.ContentType, "image/jpeg")
	}

	if !bytes.Equal(resp.ImageData, imageData) {
		t.Error("GetImage() returned different image data")
	}
}

// TestGetImage_RoomNotFound はルームが存在しない場合のエラーをテストする.
func TestGetImage_RoomNotFound(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	blobClient := newMockBlobClient()
	kvsClient := newMockKVSClient()
	roomRepo := newMockRoomRepository()

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
	if !connect.As(err, &connectErr) {
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
	blobClient := newMockBlobClient()
	kvsClient := newMockKVSClient()
	roomRepo := newMockRoomRepository()

	// ルームは存在する
	roomID := uuid.New()
	room := domainroom.NewRoom("123456")
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
	if !connect.As(err, &connectErr) {
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
	blobClient := newMockBlobClient()
	kvsClient := newMockKVSClient()
	roomRepo := newMockRoomRepository()

	// テストデータの準備
	roomID := uuid.New()
	room := domainroom.NewRoom("123456")
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

	if len(resp.Images) != len(imageIDs) {
		t.Errorf("ListImages() returned %d images, want %d", len(resp.Images), len(imageIDs))
	}

	for _, img := range resp.Images {
		if img.ImageId == "" {
			t.Error("ListImages() returned image with empty ID")
		}

		if img.ImagePath == "" {
			t.Error("ListImages() returned image with empty path")
		}

		if img.Size == 0 {
			t.Error("ListImages() returned image with zero size")
		}

		if img.LastModified == nil {
			t.Error("ListImages() returned image with nil LastModified")
		}
	}
}

// TestListImages_EmptyResult は画像が存在しない場合の空配列レスポンスをテストする.
func TestListImages_EmptyResult(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	blobClient := newMockBlobClient()
	kvsClient := newMockKVSClient()
	roomRepo := newMockRoomRepository()

	// ルームは存在するが画像は存在しない
	roomID := uuid.New()
	room := domainroom.NewRoom("123456")
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

	if len(resp.Images) != 0 {
		t.Errorf("ListImages() returned %d images, want 0", len(resp.Images))
	}
}

// TestListImages_RoomNotFound はルームが存在しない場合のエラーをテストする.
func TestListImages_RoomNotFound(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	blobClient := newMockBlobClient()
	kvsClient := newMockKVSClient()
	roomRepo := newMockRoomRepository()

	svc := image.NewService(blobClient, kvsClient, roomRepo)
	req := &scene_hunterv1.ListImagesRequest{
		RoomId: uuid.New().String(),
	}

	_, err := svc.ListImages(ctx, req)
	if err == nil {
		t.Fatal("ListImages() should fail when room not found")
	}

	var connectErr *connect.Error
	if !connect.As(err, &connectErr) {
		t.Fatal("error should be connect.Error")
	}

	if connectErr.Code() != connect.CodeNotFound {
		t.Errorf("ListImages() error code = %v, want %v", connectErr.Code(), connect.CodeNotFound)
	}
}

package room_test

import (
	"context"
	"testing"

	"github.com/testcontainers/testcontainers-go/modules/valkey"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	infrakvs "github.com/yashikota/scene-hunter/server/internal/infra/kvs"
	"github.com/yashikota/scene-hunter/server/internal/repository"
	roomsvc "github.com/yashikota/scene-hunter/server/internal/service/room"
)

// setupValkey はテスト用のValkeyコンテナをセットアップする.
func setupValkey(ctx context.Context, t *testing.T) (string, func()) {
	t.Helper()

	valkeyContainer, err := valkey.Run(ctx, "docker.io/valkey/valkey:9.0.0")
	if err != nil {
		t.Fatalf("failed to start valkey container: %v", err)
	}

	addr, err := valkeyContainer.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("failed to get connection string: %v", err)
	}

	cleanup := func() {
		if err := valkeyContainer.Terminate(ctx); err != nil {
			t.Logf("failed to terminate container: %v", err)
		}
	}

	return addr, cleanup
}

func setupTestService(ctx context.Context, t *testing.T) (*roomsvc.Service, func()) {
	t.Helper()

	addr, cleanup := setupValkey(ctx, t)

	kvsClient, err := infrakvs.NewClient(addr, "")
	if err != nil {
		cleanup()
		t.Fatalf("KVS client initialization failed: %v", err)
	}

	// Ping to verify connection
	err = kvsClient.Ping(ctx)
	if err != nil {
		cleanup()
		t.Fatalf("KVS ping failed: %v", err)
	}

	repo := repository.NewRoomRepository(kvsClient)
	service := roomsvc.NewService(repo)

	return service, cleanup
}

func TestService_CreateRoom(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	service, cleanup := setupTestService(ctx, t)
	defer cleanup()

	req := &scene_hunterv1.CreateRoomRequest{}

	resp, err := service.CreateRoom(ctx, req)
	if err != nil {
		t.Fatalf("CreateRoom failed: %v", err)
	}

	if resp.GetRoom() == nil {
		t.Fatal("Room is nil")
	}

	if resp.GetRoom().GetId() == "" {
		t.Error("Room ID is empty")
	}

	if resp.GetRoom().GetRoomCode() == "" {
		t.Error("Room code is empty")
	}

	if len(resp.GetRoom().GetRoomCode()) != 6 {
		t.Errorf("Room code length is %d, want 6", len(resp.GetRoom().GetRoomCode()))
	}
}

func TestService_GetRoom(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	service, cleanup := setupTestService(ctx, t)
	defer cleanup()

	// Create a room first
	createReq := &scene_hunterv1.CreateRoomRequest{}

	createResp, err := service.CreateRoom(ctx, createReq)
	if err != nil {
		t.Fatalf("CreateRoom failed: %v", err)
	}

	roomID := createResp.GetRoom().GetId()

	// Get the room
	getReq := &scene_hunterv1.GetRoomRequest{
		Id: roomID,
	}

	getResp, err := service.GetRoom(ctx, getReq)
	if err != nil {
		t.Fatalf("GetRoom failed: %v", err)
	}

	if getResp.GetRoom().GetId() != roomID {
		t.Errorf("Room ID is %s, want %s", getResp.GetRoom().GetId(), roomID)
	}

	if getResp.GetRoom().GetRoomCode() != createResp.GetRoom().GetRoomCode() {
		t.Errorf(
			"Room code is %s, want %s",
			getResp.GetRoom().GetRoomCode(),
			createResp.GetRoom().GetRoomCode(),
		)
	}
}

func TestService_UpdateRoom(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	service, cleanup := setupTestService(ctx, t)
	defer cleanup()

	// Create a room first
	createReq := &scene_hunterv1.CreateRoomRequest{}

	createResp, err := service.CreateRoom(ctx, createReq)
	if err != nil {
		t.Fatalf("CreateRoom failed: %v", err)
	}

	roomID := createResp.GetRoom().GetId()
	newRoomCode := "999999"

	// Update the room
	updateReq := &scene_hunterv1.UpdateRoomRequest{
		Room: &scene_hunterv1.Room{
			Id:       roomID,
			RoomCode: newRoomCode,
		},
	}

	updateResp, err := service.UpdateRoom(ctx, updateReq)
	if err != nil {
		t.Fatalf("UpdateRoom failed: %v", err)
	}

	if updateResp.GetRoom().GetRoomCode() != newRoomCode {
		t.Errorf("Room code is %s, want %s", updateResp.GetRoom().GetRoomCode(), newRoomCode)
	}
}

func TestService_DeleteRoom(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	service, cleanup := setupTestService(ctx, t)
	defer cleanup()

	// Create a room first
	createReq := &scene_hunterv1.CreateRoomRequest{}

	createResp, err := service.CreateRoom(ctx, createReq)
	if err != nil {
		t.Fatalf("CreateRoom failed: %v", err)
	}

	roomID := createResp.GetRoom().GetId()

	// Delete the room
	deleteReq := &scene_hunterv1.DeleteRoomRequest{
		Id: roomID,
	}

	deleteResp, err := service.DeleteRoom(ctx, deleteReq)
	if err != nil {
		t.Fatalf("DeleteRoom failed: %v", err)
	}

	if deleteResp.GetRoom().GetId() != roomID {
		t.Errorf("Room ID is %s, want %s", deleteResp.GetRoom().GetId(), roomID)
	}

	// Verify the room is deleted
	getReq := &scene_hunterv1.GetRoomRequest{
		Id: roomID,
	}

	_, err = service.GetRoom(ctx, getReq)
	if err == nil {
		t.Error("GetRoom should fail after deletion")
	}
}

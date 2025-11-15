package room_test

import (
	"context"
	"testing"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	infrakvs "github.com/yashikota/scene-hunter/server/internal/infra/kvs"
	infrarepository "github.com/yashikota/scene-hunter/server/internal/infra/repository"
	roomsvc "github.com/yashikota/scene-hunter/server/internal/service/room"
	"github.com/yashikota/scene-hunter/server/util/config"
)

func setupTestService(t *testing.T) (*roomsvc.Service, context.Context) {
	t.Helper()

	ctx := context.Background()
	cfg := config.LoadConfigFromPath("../../..")

	kvsClient, err := infrakvs.NewClient(cfg.Kvs.URL, "")
	if err != nil {
		t.Skipf("KVS client initialization failed: %v", err)
	}

	// Ping to verify connection
	err = kvsClient.Ping(ctx)
	if err != nil {
		t.Skipf("KVS ping failed: %v", err)
	}

	repo := infrarepository.NewRoomRepository(kvsClient)
	service := roomsvc.NewService(repo)

	return service, ctx
}

func TestService_CreateRoom(t *testing.T) {
	t.Parallel()
	service, ctx := setupTestService(t)

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
	service, ctx := setupTestService(t)

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
	service, ctx := setupTestService(t)

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
	service, ctx := setupTestService(t)

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

// Package game provides game service handler.
package game

import (
	"context"

	"github.com/google/uuid"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	"github.com/yashikota/scene-hunter/server/internal/service"
	gamesvc "github.com/yashikota/scene-hunter/server/internal/service/game"
	"github.com/yashikota/scene-hunter/server/internal/service/middleware"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// Handler wraps the game service.
type Handler struct {
	service  *gamesvc.Service
	roomRepo service.RoomRepository
}

// NewHandler creates a new game handler.
func NewHandler(svc *gamesvc.Service, roomRepo service.RoomRepository) *Handler {
	return &Handler{
		service:  svc,
		roomRepo: roomRepo,
	}
}

// StartGame starts a new game.
func (h *Handler) StartGame(
	ctx context.Context,
	req *scene_hunterv1.StartGameRequest,
) (*scene_hunterv1.StartGameResponse, error) {
	roomID, err := uuid.Parse(req.GetRoomId())
	if err != nil {
		return nil, errors.Errorf("invalid room_id: %w", err)
	}

	gameMasterUserID, err := uuid.Parse(req.GetGameMasterUserId())
	if err != nil {
		return nil, errors.Errorf("invalid game_master_user_id: %w", err)
	}

	game, err := h.service.StartGame(ctx, roomID, int(req.GetTotalRounds()), gameMasterUserID)
	if err != nil {
		return nil, errors.Errorf("failed to start game: %w", err)
	}

	pbGame := convertGameToProto(game)

	return &scene_hunterv1.StartGameResponse{
		Game: pbGame,
	}, nil
}

// JoinGame allows a player to join a game.
func (h *Handler) JoinGame(
	ctx context.Context,
	req *scene_hunterv1.JoinGameRequest,
) (*scene_hunterv1.JoinGameResponse, error) {
	roomID, err := uuid.Parse(req.GetRoomId())
	if err != nil {
		return nil, errors.Errorf("invalid room_id: %w", err)
	}

	userID, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, errors.Errorf("invalid user_id: %w", err)
	}

	// Get authenticated user ID from context
	authenticatedUserID, err := middleware.GetAuthenticatedUserID(ctx)
	if err != nil {
		return nil, errors.Errorf("failed to get authenticated user ID: %w", err)
	}

	// Verify that the user is joining as themselves
	if userID != authenticatedUserID {
		return nil, errors.New("cannot join game as another user")
	}

	// Get room to check admin status
	room, err := h.roomRepo.Get(ctx, roomID)
	if err != nil {
		return nil, errors.Errorf("failed to get room: %w", err)
	}

	// Check if user is room admin
	isAdmin := room.IsAdmin(userID)

	// isGameMaster is determined by the game logic (set during game/round creation)
	// For now, it's false when joining
	isGameMaster := false

	game, err := h.service.JoinGame(ctx, roomID, userID, req.GetName(), isGameMaster, isAdmin)
	if err != nil {
		return nil, errors.Errorf("failed to join game: %w", err)
	}

	pbGame := convertGameToProto(game)

	return &scene_hunterv1.JoinGameResponse{
		Game: pbGame,
	}, nil
}

// SubmitGameMasterPhoto submits the game master's photo and generates hints.
func (h *Handler) SubmitGameMasterPhoto(
	ctx context.Context,
	req *scene_hunterv1.SubmitGameMasterPhotoRequest,
) (*scene_hunterv1.SubmitGameMasterPhotoResponse, error) {
	roomID, err := uuid.Parse(req.GetRoomId())
	if err != nil {
		return nil, errors.Errorf("invalid room_id: %w", err)
	}

	userID, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, errors.Errorf("invalid user_id: %w", err)
	}

	// Get authenticated user ID from context
	authenticatedUserID, err := middleware.GetAuthenticatedUserID(ctx)
	if err != nil {
		return nil, errors.Errorf("failed to get authenticated user ID: %w", err)
	}

	// Verify that the user is submitting as themselves
	if userID != authenticatedUserID {
		return nil, errors.New("cannot submit photo as another user")
	}

	// Authorization check is done in the service layer
	// (verifies user is the game master for current round)

	imageID, hints, err := h.service.SubmitGameMasterPhoto(ctx, roomID, userID, req.GetImageData())
	if err != nil {
		return nil, errors.Errorf("failed to submit game master photo: %w", err)
	}

	pbHints := make([]*scene_hunterv1.Hint, len(hints))
	for i, hint := range hints {
		pbHints[i] = &scene_hunterv1.Hint{
			HintNumber: int32(hint.HintNumber),
			Text:       hint.Text,
		}
	}

	return &scene_hunterv1.SubmitGameMasterPhotoResponse{
		ImageId: imageID,
		Hints:   pbHints,
	}, nil
}

// SubmitHunterPhoto submits a hunter's photo.
func (h *Handler) SubmitHunterPhoto(
	ctx context.Context,
	req *scene_hunterv1.SubmitHunterPhotoRequest,
) (*scene_hunterv1.SubmitHunterPhotoResponse, error) {
	roomID, err := uuid.Parse(req.GetRoomId())
	if err != nil {
		return nil, errors.Errorf("invalid room_id: %w", err)
	}

	userID, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, errors.Errorf("invalid user_id: %w", err)
	}

	imageID, allSubmitted, err := h.service.SubmitHunterPhoto(
		ctx,
		roomID,
		userID,
		req.GetImageData(),
		int(req.GetElapsedSeconds()),
	)
	if err != nil {
		return nil, errors.Errorf("failed to submit hunter photo: %w", err)
	}

	return &scene_hunterv1.SubmitHunterPhotoResponse{
		ImageId:             imageID,
		AllHuntersSubmitted: allSubmitted,
	}, nil
}

// GetHunterPhotos returns all hunter photo submissions for the current round.
func (h *Handler) GetHunterPhotos(
	ctx context.Context,
	req *scene_hunterv1.GetHunterPhotosRequest,
) (*scene_hunterv1.GetHunterPhotosResponse, error) {
	roomID, err := uuid.Parse(req.GetRoomId())
	if err != nil {
		return nil, errors.Errorf("invalid room_id: %w", err)
	}

	submissions, err := h.service.GetHunterPhotos(ctx, roomID)
	if err != nil {
		return nil, errors.Errorf("failed to get hunter photos: %w", err)
	}

	pbSubmissions := make([]*scene_hunterv1.HunterSubmission, len(submissions))
	for i, sub := range submissions {
		pbSubmissions[i] = &scene_hunterv1.HunterSubmission{
			UserId:             sub.UserID.String(),
			ImageId:            sub.ImageID,
			SubmittedAtSeconds: int32(sub.SubmittedAtSeconds),
		}
	}

	return &scene_hunterv1.GetHunterPhotosResponse{
		Submissions: pbSubmissions,
	}, nil
}

// SelectWinners allows game master to select winners and assign ranks.
func (h *Handler) SelectWinners(
	ctx context.Context,
	req *scene_hunterv1.SelectWinnersRequest,
) (*scene_hunterv1.SelectWinnersResponse, error) {
	roomID, err := uuid.Parse(req.GetRoomId())
	if err != nil {
		return nil, errors.Errorf("invalid room_id: %w", err)
	}

	gameMasterUserID, err := uuid.Parse(req.GetGameMasterUserId())
	if err != nil {
		return nil, errors.Errorf("invalid game_master_user_id: %w", err)
	}

	// Get authenticated user ID from context
	authenticatedUserID, err := middleware.GetAuthenticatedUserID(ctx)
	if err != nil {
		return nil, errors.Errorf("failed to get authenticated user ID: %w", err)
	}

	// Verify that the user is selecting winners as themselves
	if gameMasterUserID != authenticatedUserID {
		return nil, errors.New("cannot select winners as another user")
	}

	// Authorization check is done in the service layer
	// (verifies user is the game master for current round)

	// Convert rankings from proto to map
	rankings := make(map[uuid.UUID]int)

	for _, rankSel := range req.GetRankings() {
		userID, err := uuid.Parse(rankSel.GetUserId())
		if err != nil {
			return nil, errors.Errorf("invalid user_id in rankings: %w", err)
		}

		rankings[userID] = int(rankSel.GetRank())
	}

	game, err := h.service.SelectWinners(ctx, roomID, gameMasterUserID, rankings)
	if err != nil {
		return nil, errors.Errorf("failed to select winners: %w", err)
	}

	pbGame := convertGameToProto(game)

	return &scene_hunterv1.SelectWinnersResponse{
		Game: pbGame,
	}, nil
}

// GetGameState returns the current game state.
func (h *Handler) GetGameState(
	ctx context.Context,
	req *scene_hunterv1.GetGameStateRequest,
) (*scene_hunterv1.GetGameStateResponse, error) {
	roomID, err := uuid.Parse(req.GetRoomId())
	if err != nil {
		return nil, errors.Errorf("invalid room_id: %w", err)
	}

	game, err := h.service.GetGameState(ctx, roomID)
	if err != nil {
		return nil, errors.Errorf("failed to get game state: %w", err)
	}

	pbGame := convertGameToProto(game)

	return &scene_hunterv1.GetGameStateResponse{
		Game: pbGame,
	}, nil
}

// StartNextRound starts the next round.
func (h *Handler) StartNextRound(
	ctx context.Context,
	req *scene_hunterv1.StartNextRoundRequest,
) (*scene_hunterv1.StartNextRoundResponse, error) {
	roomID, err := uuid.Parse(req.GetRoomId())
	if err != nil {
		return nil, errors.Errorf("invalid room_id: %w", err)
	}

	gameMasterUserID, err := uuid.Parse(req.GetGameMasterUserId())
	if err != nil {
		return nil, errors.Errorf("invalid game_master_user_id: %w", err)
	}

	game, err := h.service.StartRound(ctx, roomID, gameMasterUserID)
	if err != nil {
		return nil, errors.Errorf("failed to start next round: %w", err)
	}

	pbGame := convertGameToProto(game)

	return &scene_hunterv1.StartNextRoundResponse{
		Game: pbGame,
	}, nil
}

// EndGame ends the game and returns final rankings.
func (h *Handler) EndGame(
	ctx context.Context,
	req *scene_hunterv1.EndGameRequest,
) (*scene_hunterv1.EndGameResponse, error) {
	roomID, err := uuid.Parse(req.GetRoomId())
	if err != nil {
		return nil, errors.Errorf("invalid room_id: %w", err)
	}

	game, rankings, err := h.service.EndGame(ctx, roomID)
	if err != nil {
		return nil, errors.Errorf("failed to end game: %w", err)
	}

	pbGame := convertGameToProto(game)

	pbRankings := make([]*scene_hunterv1.Player, len(rankings))
	for i, player := range rankings {
		pbRankings[i] = &scene_hunterv1.Player{
			UserId:       player.UserID.String(),
			Name:         player.Name,
			IsGameMaster: player.IsGameMaster,
			IsAdmin:      player.IsAdmin,
			TotalPoints:  int32(player.TotalPoints),
			IsConnected:  player.IsConnected,
		}
	}

	return &scene_hunterv1.EndGameResponse{
		Game:          pbGame,
		FinalRankings: pbRankings,
	}, nil
}

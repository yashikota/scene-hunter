// Package game provides game service handler.
package game

import (
	"context"

	"github.com/google/uuid"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	gamesvc "github.com/yashikota/scene-hunter/server/internal/service/game"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// Handler wraps the game service.
type Handler struct {
	service *gamesvc.Service
}

// NewHandler creates a new game handler.
func NewHandler(service *gamesvc.Service) *Handler {
	return &Handler{
		service: service,
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

	// TODO: Get isGameMaster and isAdmin from context or request
	game, err := h.service.JoinGame(ctx, roomID, userID, req.GetName(), false, false)
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

// SubmitHunterPhoto submits a hunter's photo and calculates score.
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

	score, remainingSeconds, points, err := h.service.SubmitHunterPhoto(
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
		Score:            int32(score),
		RemainingSeconds: int32(remainingSeconds),
		Points:           int32(points),
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

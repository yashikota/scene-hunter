// Package game represents game service.
package game

import (
	"bytes"
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/domain/game"
	"github.com/yashikota/scene-hunter/server/internal/infra/blob"
	infragemini "github.com/yashikota/scene-hunter/server/internal/infra/gemini"
	"github.com/yashikota/scene-hunter/server/internal/repository"
	servicegemini "github.com/yashikota/scene-hunter/server/internal/service/gemini"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

const (
	// hintPrompt is the prompt for generating hints from game master's photo.
	//nolint:gosmopolitan // Japanese text is required for the game
	hintPrompt = `この写真の特徴を5つの短い文章で説明してください。
撮影場所を特定できるような情報を含めてください。
以下の形式で出力してください：
1. [1つ目のヒント]
2. [2つ目のヒント]
3. [3つ目のヒント]
4. [4つ目のヒント]
5. [5つ目のヒント]`
)

// Service implements the GameService.
type Service struct {
	gameRepo     repository.GameRepository
	roomRepo     repository.RoomRepository
	blobClient   blob.Blob
	geminiClient infragemini.Gemini
	geminiSvc    *servicegemini.Service
}

// NewService creates a new game service.
func NewService(
	gameRepo repository.GameRepository,
	roomRepo repository.RoomRepository,
	blobClient blob.Blob,
	geminiClient infragemini.Gemini,
) *Service {
	return &Service{
		gameRepo:     gameRepo,
		roomRepo:     roomRepo,
		blobClient:   blobClient,
		geminiClient: geminiClient,
		geminiSvc:    servicegemini.NewService(blobClient, geminiClient),
	}
}

// StartGame starts a new game.
func (s *Service) StartGame(
	ctx context.Context,
	roomID uuid.UUID,
	totalRounds int,
	gameMasterUserID uuid.UUID,
) (*game.Game, error) {
	// Check if room exists
	_, err := s.roomRepo.Get(ctx, roomID)
	if err != nil {
		return nil, errors.Errorf("room not found: %w", err)
	}

	// Check if game already exists
	exists, err := s.gameRepo.Exists(ctx, roomID)
	if err != nil {
		return nil, errors.Errorf("failed to check game existence: %w", err)
	}

	if exists {
		return nil, game.ErrGameAlreadyStarted
	}

	// Create new game
	gameSession, err := game.NewGame(roomID, totalRounds, gameMasterUserID)
	if err != nil {
		return nil, errors.Errorf("failed to create new game: %w", err)
	}

	// Save game to repository
	err = s.gameRepo.Create(ctx, gameSession)
	if err != nil {
		return nil, errors.Errorf("failed to create game: %w", err)
	}

	return gameSession, nil
}

// JoinGame allows a player to join a game.
func (s *Service) JoinGame(
	ctx context.Context,
	roomID, userID uuid.UUID,
	name string,
	isGameMaster, isAdmin bool,
) (*game.Game, error) {
	// Get game
	gameSession, err := s.gameRepo.Get(ctx, roomID)
	if err != nil {
		return nil, errors.Errorf("failed to get game: %w", err)
	}

	// Create player
	player, err := game.NewPlayer(userID, name, isGameMaster, isAdmin)
	if err != nil {
		return nil, errors.Errorf("failed to create player: %w", err)
	}

	// Add player to game
	err = gameSession.AddPlayer(player)
	if err != nil {
		return nil, errors.Errorf("failed to add player to game: %w", err)
	}

	// Update game
	err = s.gameRepo.Update(ctx, gameSession)
	if err != nil {
		return nil, errors.Errorf("failed to update game: %w", err)
	}

	return gameSession, nil
}

// StartRound starts a new round.
func (s *Service) StartRound(
	ctx context.Context,
	roomID uuid.UUID,
	gameMasterUserID uuid.UUID,
) (*game.Game, error) {
	// Get game
	gameSession, err := s.gameRepo.Get(ctx, roomID)
	if err != nil {
		return nil, errors.Errorf("failed to get game: %w", err)
	}

	// Start game if not started
	if gameSession.Status == game.GameStatusWaiting {
		err = gameSession.Start()
		if err != nil {
			return nil, errors.Errorf("failed to start game: %w", err)
		}
	}

	// Start round
	err = gameSession.StartRound(gameMasterUserID)
	if err != nil {
		return nil, errors.Errorf("failed to start round: %w", err)
	}

	// Update game
	err = s.gameRepo.Update(ctx, gameSession)
	if err != nil {
		return nil, errors.Errorf("failed to update game: %w", err)
	}

	return gameSession, nil
}

// SubmitGameMasterPhoto submits game master's photo and generates hints.
func (s *Service) SubmitGameMasterPhoto(
	ctx context.Context,
	roomID, userID uuid.UUID,
	imageData []byte,
) (string, []*game.Hint, error) {
	// Get game
	gameSession, err := s.gameRepo.Get(ctx, roomID)
	if err != nil {
		return "", nil, errors.Errorf("failed to get game: %w", err)
	}

	// Get current round
	round, err := gameSession.GetCurrentRound()
	if err != nil {
		return "", nil, errors.Errorf("failed to get current round: %w", err)
	}

	// Verify user is game master for this round
	if round.GameMasterUserID != userID {
		return "", nil, errors.New("only game master can submit photo")
	}

	// Generate image ID
	imageID := uuid.New().String()
	imageKey := fmt.Sprintf("images/%s/%s", roomID, imageID)

	// Upload image to blob storage
	imageReader := bytes.NewReader(imageData)

	err = s.blobClient.Put(ctx, imageKey, imageReader, 24*time.Hour)
	if err != nil {
		return "", nil, errors.Errorf("failed to upload image: %w", err)
	}

	// Generate hints using Gemini
	result, err := s.geminiSvc.AnalyzeImageFromBlob(ctx, imageKey, hintPrompt)
	if err != nil {
		return "", nil, errors.Errorf("failed to generate hints: %w", err)
	}

	// Parse hints from result
	hints, err := parseHints(result.Features)
	if err != nil {
		return "", nil, errors.Errorf("failed to parse hints: %w", err)
	}

	// Update round with image and hints
	round.SetGameMasterImage(imageID)
	round.SetHints(hints)

	// Start hunters' turn
	err = round.StartHuntersTurn()
	if err != nil {
		return "", nil, errors.Errorf("failed to start hunters' turn: %w", err)
	}

	// Update game
	err = s.gameRepo.Update(ctx, gameSession)
	if err != nil {
		return "", nil, errors.Errorf("failed to update game: %w", err)
	}

	return imageID, hints, nil
}

// SubmitHunterPhoto submits hunter's photo.
func (s *Service) SubmitHunterPhoto(
	ctx context.Context,
	roomID, userID uuid.UUID,
	imageData []byte,
	elapsedSeconds int,
) (string, bool, error) {
	// Get game
	gameSession, err := s.gameRepo.Get(ctx, roomID)
	if err != nil {
		return "", false, errors.Errorf("failed to get game: %w", err)
	}

	// Get current round
	round, err := gameSession.GetCurrentRound()
	if err != nil {
		return "", false, errors.Errorf("failed to get current round: %w", err)
	}

	// Verify round is in hunters' phase
	if round.TurnStatus != game.TurnStatusHunters {
		return "", false, errors.New("not in hunters' turn")
	}

	// Verify game master image has been uploaded
	if round.GameMasterImageID == "" {
		return "", false, errors.New("game master has not uploaded image yet")
	}

	// Verify user is not game master
	if round.GameMasterUserID == userID {
		return "", false, errors.New("game master cannot submit as hunter")
	}

	// Generate hunter's image ID and upload
	hunterImageID := uuid.New().String()
	hunterImageKey := fmt.Sprintf("images/%s/%s", roomID, hunterImageID)

	hunterImageReader := bytes.NewReader(imageData)

	err = s.blobClient.Put(ctx, hunterImageKey, hunterImageReader, 24*time.Hour)
	if err != nil {
		return "", false, errors.Errorf("failed to upload hunter image: %w", err)
	}

	// Create hunter submission
	submission, err := game.NewHunterSubmission(userID, hunterImageID, elapsedSeconds)
	if err != nil {
		return "", false, errors.Errorf("failed to create hunter submission: %w", err)
	}

	// Add submission to round
	round.AddHunterSubmission(submission)

	// Count total hunters (exclude game master)
	totalHunters := len(gameSession.Players) - 1

	// Check if all hunters have submitted
	allSubmitted := round.CheckAllHuntersSubmitted(totalHunters)
	if allSubmitted {
		round.StartWaitingForSelection()
	}

	// Update game
	err = s.gameRepo.Update(ctx, gameSession)
	if err != nil {
		return "", false, errors.Errorf("failed to update game: %w", err)
	}

	return hunterImageID, allSubmitted, nil
}

// GetHunterPhotos returns all hunter photo submissions for the current round.
func (s *Service) GetHunterPhotos(ctx context.Context, roomID uuid.UUID) ([]*game.HunterSubmission, error) {
	// Get game
	gameSession, err := s.gameRepo.Get(ctx, roomID)
	if err != nil {
		return nil, errors.Errorf("failed to get game: %w", err)
	}

	// Get current round
	round, err := gameSession.GetCurrentRound()
	if err != nil {
		return nil, errors.Errorf("failed to get current round: %w", err)
	}

	return round.HunterSubmissions, nil
}

// SelectWinners allows the game master to select winners and assign ranks.
func (s *Service) SelectWinners(
	ctx context.Context,
	roomID, gameMasterUserID uuid.UUID,
	rankings map[uuid.UUID]int,
) (*game.Game, error) {
	// Get game
	gameSession, err := s.gameRepo.Get(ctx, roomID)
	if err != nil {
		return nil, errors.Errorf("failed to get game: %w", err)
	}

	// Get current round
	round, err := gameSession.GetCurrentRound()
	if err != nil {
		return nil, errors.Errorf("failed to get current round: %w", err)
	}

	// Verify user is game master for this round
	if round.GameMasterUserID != gameMasterUserID {
		return nil, errors.New("only game master can select winners")
	}

	// Verify round is waiting for selection
	if round.TurnStatus != game.TurnStatusWaitingForSelection {
		return nil, errors.New("round is not waiting for selection")
	}

	// Create results from rankings
	results := make([]*game.RoundResult, 0, len(rankings))
	for userID, rank := range rankings {
		result, err := game.NewRoundResult(userID, rank)
		if err != nil {
			return nil, errors.Errorf("failed to create round result: %w", err)
		}
		results = append(results, result)

		// Update player points
		err = gameSession.UpdatePlayerPoints(userID, result.Points)
		if err != nil {
			return nil, errors.Errorf("failed to update player points: %w", err)
		}
	}

	// Set results for the round
	round.SetResults(results)

	// Update game
	err = s.gameRepo.Update(ctx, gameSession)
	if err != nil {
		return nil, errors.Errorf("failed to update game: %w", err)
	}

	return gameSession, nil
}

// GetGameState returns the current game state.
func (s *Service) GetGameState(ctx context.Context, roomID uuid.UUID) (*game.Game, error) {
	gameSession, err := s.gameRepo.Get(ctx, roomID)
	if err != nil {
		return nil, errors.Errorf("failed to get game: %w", err)
	}

	return gameSession, nil
}

// EndGame ends the game and returns final rankings.
func (s *Service) EndGame(
	ctx context.Context,
	roomID uuid.UUID,
) (*game.Game, []*game.Player, error) {
	// Get game
	gameSession, err := s.gameRepo.Get(ctx, roomID)
	if err != nil {
		return nil, nil, errors.Errorf("failed to get game: %w", err)
	}

	// Finish game
	err = gameSession.Finish()
	if err != nil {
		return nil, nil, errors.Errorf("failed to finish game: %w", err)
	}

	// Update game
	err = s.gameRepo.Update(ctx, gameSession)
	if err != nil {
		return nil, nil, errors.Errorf("failed to update game: %w", err)
	}

	// Get final rankings
	rankings := gameSession.GetFinalRankings()

	return gameSession, rankings, nil
}

// parseHints parses hints from AI response features.
func parseHints(features []string) ([]*game.Hint, error) {
	hints := make([]*game.Hint, 0, 5)

	// Ensure we have exactly 5 hints
	for hintIndex := range 5 {
		var hintText string
		if hintIndex < len(features) && features[hintIndex] != "" {
			hintText = features[hintIndex]
		} else {
			hintText = fmt.Sprintf("ヒント%d", hintIndex+1)
		}

		hint, err := game.NewHint(hintIndex+1, hintText)
		if err != nil {
			return nil, errors.Errorf("failed to create hint: %w", err)
		}

		hints = append(hints, hint)
	}

	return hints, nil
}

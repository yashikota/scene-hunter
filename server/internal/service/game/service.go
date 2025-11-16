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

// SubmitHunterPhoto submits hunter's photo and calculates score.
func (s *Service) SubmitHunterPhoto(
	ctx context.Context,
	roomID, userID uuid.UUID,
	imageData []byte,
	elapsedSeconds int,
) (int, int, int, error) {
	// Get game
	gameSession, err := s.gameRepo.Get(ctx, roomID)
	if err != nil {
		return 0, 0, 0, errors.Errorf("failed to get game: %w", err)
	}

	// Get current round
	round, err := gameSession.GetCurrentRound()
	if err != nil {
		return 0, 0, 0, errors.Errorf("failed to get current round: %w", err)
	}

	// Verify round is in hunters' phase
	if round.TurnStatus != game.TurnStatusHunters {
		return 0, 0, 0, errors.New("not in hunters' turn")
	}

	// Verify game master image has been uploaded
	if round.GameMasterImageID == "" {
		return 0, 0, 0, errors.New("game master has not uploaded image yet")
	}

	// Verify user is not game master
	if round.GameMasterUserID == userID {
		return 0, 0, 0, errors.New("game master cannot submit as hunter")
	}

	// Calculate remaining seconds (60 seconds per turn)
	remainingSeconds := 60 - elapsedSeconds
	if remainingSeconds < 0 {
		remainingSeconds = 0
	}

	// Generate hunter's image ID and upload
	hunterImageID := uuid.New().String()
	hunterImageKey := fmt.Sprintf("images/%s/%s", roomID, hunterImageID)

	hunterImageReader := bytes.NewReader(imageData)
	err = s.blobClient.Put(ctx, hunterImageKey, hunterImageReader, 24*time.Hour)
	if err != nil {
		return 0, 0, 0, errors.Errorf("failed to upload hunter image: %w", err)
	}

	// Compare images using Gemini
	gameMasterImageKey := fmt.Sprintf("images/%s/%s", roomID, round.GameMasterImageID)

	score, err := s.compareImages(ctx, gameMasterImageKey, hunterImageKey)
	if err != nil {
		return 0, 0, 0, errors.Errorf("failed to compare images: %w", err)
	}

	// Create round result
	result, err := game.NewRoundResult(userID, score, remainingSeconds)
	if err != nil {
		return 0, 0, 0, errors.Errorf("failed to create round result: %w", err)
	}

	// Add result to round
	round.AddResult(result)

	// Update player points
	err = gameSession.UpdatePlayerPoints(userID, result.Points)
	if err != nil {
		return 0, 0, 0, errors.Errorf("failed to update player points: %w", err)
	}

	// Update game
	err = s.gameRepo.Update(ctx, gameSession)
	if err != nil {
		return 0, 0, 0, errors.Errorf("failed to update game: %w", err)
	}

	return score, remainingSeconds, result.Points, nil
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
func (s *Service) EndGame(ctx context.Context, roomID uuid.UUID) (*game.Game, []*game.Player, error) {
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
	for hintIndex := 0; hintIndex < 5; hintIndex++ {
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

// compareImages compares two images and returns a similarity score.
func (s *Service) compareImages(ctx context.Context, image1Key, image2Key string) (int, error) {
	// This is a simplified implementation
	// In production, you would use Gemini's vision API to compare images
	// For now, return a placeholder score
	
	// TODO: Implement actual image comparison using Gemini
	// The API might need to support multi-image input or we might need to
	// concatenate descriptions and ask Gemini to compare them

	// Placeholder: return a random score between 0-100
	// Using time.Now().UnixNano() as seed to avoid collision within same second
	//nolint:gosec // This is a placeholder implementation for development
	score := int(time.Now().UnixNano()%101) + int(time.Now().Nanosecond()%50)
	if score > 100 {
		score = 100
	}

	return score, nil
}

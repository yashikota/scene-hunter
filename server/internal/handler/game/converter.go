package game

import (
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	"github.com/yashikota/scene-hunter/server/internal/domain/game"
)

// convertGameToProto converts domain game to protobuf game.
func convertGameToProto(gameObj *game.Game) *scene_hunterv1.Game {
	pbPlayers := make([]*scene_hunterv1.Player, len(gameObj.Players))
	for playerIndex, player := range gameObj.Players {
		pbPlayers[playerIndex] = &scene_hunterv1.Player{
			UserId:       player.UserID.String(),
			Name:         player.Name,
			IsGameMaster: player.IsGameMaster,
			IsAdmin:      player.IsAdmin,
			TotalPoints:  int32(player.TotalPoints),
			IsConnected:  player.IsConnected,
		}
	}

	pbRounds := make([]*scene_hunterv1.Round, len(gameObj.Rounds))
	for roundIndex, round := range gameObj.Rounds {
		pbHints := make([]*scene_hunterv1.Hint, len(round.Hints))
		for hintIndex, hint := range round.Hints {
			pbHints[hintIndex] = &scene_hunterv1.Hint{
				HintNumber: int32(hint.HintNumber),
				Text:       hint.Text,
			}
		}

		pbResults := make([]*scene_hunterv1.RoundResult, len(round.Results))
		for resultIndex, result := range round.Results {
			pbResults[resultIndex] = &scene_hunterv1.RoundResult{
				UserId:           result.UserID.String(),
				Score:            int32(result.Score),
				RemainingSeconds: int32(result.RemainingSeconds),
				Points:           int32(result.Points),
			}
		}

		pbRounds[roundIndex] = &scene_hunterv1.Round{
			RoundNumber:        int32(round.RoundNumber),
			GameMasterUserId:   round.GameMasterUserID.String(),
			GameMasterImageId:  round.GameMasterImageID,
			Hints:              pbHints,
			Results:            pbResults,
			TurnStatus:         convertTurnStatusToProto(round.TurnStatus),
			TurnElapsedSeconds: int32(round.TurnElapsedSeconds),
		}
	}

	return &scene_hunterv1.Game{
		RoomId:       gameObj.RoomID.String(),
		Status:       convertGameStatusToProto(gameObj.Status),
		TotalRounds:  int32(gameObj.TotalRounds),
		CurrentRound: int32(gameObj.CurrentRound),
		Players:      pbPlayers,
		Rounds:       pbRounds,
		CreatedAt:    gameObj.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:    gameObj.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// convertGameStatusToProto converts domain game status to protobuf game status.
func convertGameStatusToProto(status game.GameStatus) scene_hunterv1.GameStatus {
	switch status {
	case game.GameStatusWaiting:
		return scene_hunterv1.GameStatus_GAME_STATUS_WAITING
	case game.GameStatusInProgress:
		return scene_hunterv1.GameStatus_GAME_STATUS_IN_PROGRESS
	case game.GameStatusFinished:
		return scene_hunterv1.GameStatus_GAME_STATUS_FINISHED
	default:
		return scene_hunterv1.GameStatus_GAME_STATUS_UNSPECIFIED
	}
}

// convertTurnStatusToProto converts domain turn status to protobuf turn status.
func convertTurnStatusToProto(status game.TurnStatus) scene_hunterv1.TurnStatus {
	switch status {
	case game.TurnStatusGameMaster:
		return scene_hunterv1.TurnStatus_TURN_STATUS_GAME_MASTER
	case game.TurnStatusHunters:
		return scene_hunterv1.TurnStatus_TURN_STATUS_HUNTERS
	default:
		return scene_hunterv1.TurnStatus_TURN_STATUS_UNSPECIFIED
	}
}

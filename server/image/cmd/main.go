package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/yashikota/scene-hunter/server/image/config"
	"github.com/yashikota/scene-hunter/server/image/internal/api"
	"github.com/yashikota/scene-hunter/server/image/internal/auth"
	"github.com/yashikota/scene-hunter/server/image/internal/storage"
	"github.com/yashikota/scene-hunter/server/image/internal/transform"
)

func main() {
	// コマンドライン引数を解析
	configPath := flag.String("config", "config/config.toml", "設定ファイルのパス")
	flag.Parse()

	// ロガーを設定
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	// 設定を読み込む
	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Error("設定ファイルの読み込みに失敗しました", "error", err)
		os.Exit(1)
	}

	// デバッグモードの場合はログレベルを変更
	if cfg.Server.Debug {
		logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))
		slog.SetDefault(logger)
	}

	logger.Info("設定を読み込みました", "config_path", *configPath)

	// ストレージを初期化
	storageConfig := &storage.Config{
		Endpoint:        cfg.Storage.Endpoint,
		AccessKey:       cfg.Storage.AccessKey,
		SecretKey:       cfg.Storage.SecretKey,
		UseSSL:          cfg.Storage.UseSSL,
		TemporaryBucket: cfg.Storage.TemporaryBucket,
		PermanentBucket: cfg.Storage.PermanentBucket,
		AccountID:       cfg.Storage.AccountID,
		StorageType:     "minio", // デフォルトはMinIO
	}

	store, err := storage.NewStorage(storageConfig)
	if err != nil {
		logger.Error("ストレージの初期化に失敗しました", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	logger.Info("ストレージを初期化しました",
		"endpoint", cfg.Storage.Endpoint,
		"temporary_bucket", cfg.Storage.TemporaryBucket,
		"permanent_bucket", cfg.Storage.PermanentBucket)

	// 画像変換を初期化
	transformer, err := transform.NewTransformer(cfg)
	if err != nil {
		logger.Error("画像変換の初期化に失敗しました", "error", err)
		os.Exit(1)
	}
	defer transformer.Close()

	logger.Info("画像変換を初期化しました")

	// 認証マネージャーを初期化
	authManager := auth.NewManager(cfg)
	logger.Info("認証マネージャーを初期化しました", "enabled", cfg.Auth.Enabled)

	// Echoインスタンスを作成
	e := echo.New()
	e.HideBanner = true

	// ハンドラーを作成
	handler := api.NewHandler(cfg, store, transformer)

	// ルーティングを設定
	api.SetupRoutes(e, cfg, handler, authManager)

	// サーバーを起動
	go func() {
		addr := fmt.Sprintf(":%d", cfg.Server.Port)
		logger.Info("サーバーを起動します", "port", cfg.Server.Port)
		if err := e.Start(addr); err != nil {
			logger.Error("サーバーの起動に失敗しました", "error", err)
		}
	}()

	// シグナルを待機
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	// グレースフルシャットダウン
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	logger.Info("サーバーをシャットダウンします")
	if err := e.Shutdown(ctx); err != nil {
		logger.Error("サーバーのシャットダウンに失敗しました", "error", err)
	}

	logger.Info("サーバーを終了します")
}

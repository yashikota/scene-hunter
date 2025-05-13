package storage

import (
	"bytes"
	"context"
	"io"
	"testing"

	"github.com/testcontainers/testcontainers-go/modules/minio"
)

func TestS3CompatibleStorage(t *testing.T) {
	// MinIOコンテナを起動
	ctx := context.Background()
	minioContainer, err := minio.Run(ctx, "minio/minio:RELEASE.2025-04-22T22-12-26Z")
	if err != nil {
		t.Fatalf("MinIOコンテナの起動に失敗しました: %v", err)
	}
	defer func() {
		if err := minioContainer.Terminate(ctx); err != nil {
			t.Fatalf("MinIOコンテナの終了に失敗しました: %v", err)
		}
	}()

	// MinIOの接続情報を取得
	endpoint, err := minioContainer.Endpoint(ctx, "")
	if err != nil {
		t.Fatalf("MinIOエンドポイントの取得に失敗しました: %v", err)
	}
	accessKey := "minioadmin"
	secretKey := "minioadmin"

	// テスト用のバケット名
	tempBucket := "test-temp-bucket"
	permBucket := "test-perm-bucket"

	// テスト用の設定
	cfg := &Config{
		Endpoint:        endpoint,
		AccessKey:       accessKey,
		SecretKey:       secretKey,
		UseSSL:          false,
		TemporaryBucket: tempBucket,
		PermanentBucket: permBucket,
		Region:          "auto",
		StorageType:     "minio",
	}

	// S3互換ストレージを作成
	storage, err := NewS3Storage(cfg)
	if err != nil {
		t.Fatalf("S3互換ストレージの作成に失敗しました: %v", err)
	}
	defer storage.Close()

	// テスト用のデータ
	testData := []byte("テストデータ")
	testID := "test-id"
	testFilename := "test.txt"
	testMetadata := map[string]interface{}{
		"test-key": "test-value",
	}

	// アップロードのテスト（永続バケットを使用）
	info, err := storage.Upload(context.Background(), testID, testFilename, bytes.NewReader(testData), testMetadata, true, "")
	if err != nil {
		t.Fatalf("アップロードに失敗しました: %v", err)
	}

	// 情報が正しいか確認
	if info.ID != testID {
		t.Errorf("IDが一致しません: expected=%s, actual=%s", testID, info.ID)
	}
	if info.Filename != testFilename {
		t.Errorf("ファイル名が一致しません: expected=%s, actual=%s", testFilename, info.Filename)
	}
	if info.Format != "txt" {
		t.Errorf("フォーマットが一致しません: expected=txt, actual=%s", info.Format)
	}
	if v, ok := info.Metadata["test-key"]; !ok || v != "test-value" {
		t.Errorf("メタデータが一致しません")
	}

	// 情報取得のテスト
	getInfo, err := storage.GetInfo(context.Background(), testID)
	if err != nil {
		t.Fatalf("情報取得に失敗しました: %v", err)
	}

	// 情報が一致するか確認
	if getInfo.ID != info.ID {
		t.Errorf("IDが一致しません: expected=%s, actual=%s", info.ID, getInfo.ID)
	}
	if getInfo.Filename != info.Filename {
		t.Errorf("ファイル名が一致しません: expected=%s, actual=%s", info.Filename, getInfo.Filename)
	}
	if getInfo.Format != info.Format {
		t.Errorf("フォーマットが一致しません: expected=%s, actual=%s", info.Format, getInfo.Format)
	}

	// データ取得のテスト
	reader, _, err := storage.Get(context.Background(), testID)
	if err != nil {
		t.Fatalf("データ取得に失敗しました: %v", err)
	}
	defer reader.Close()

	// データが一致するか確認
	getData, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("データの読み込みに失敗しました: %v", err)
	}
	if !bytes.Equal(getData, testData) {
		t.Errorf("データが一致しません")
	}

	// 削除のテスト
	err = storage.Delete(context.Background(), testID)
	if err != nil {
		t.Fatalf("削除に失敗しました: %v", err)
	}

	// 削除後に情報取得を試みる
	_, err = storage.GetInfo(context.Background(), testID)
	if err == nil {
		t.Errorf("削除後に情報が取得できてしまいました")
	}
}

// TestInvalidBucketName はバケット名のバリデーションをテストする
func TestInvalidBucketName(t *testing.T) {
	// MinIOコンテナを起動
	ctx := context.Background()
	minioContainer, err := minio.Run(ctx, "minio/minio:RELEASE.2025-04-22T22-12-26Z")
	if err != nil {
		t.Fatalf("MinIOコンテナの起動に失敗しました: %v", err)
	}
	defer func() {
		if err := minioContainer.Terminate(ctx); err != nil {
			t.Fatalf("MinIOコンテナの終了に失敗しました: %v", err)
		}
	}()

	// MinIOの接続情報を取得
	endpoint, err := minioContainer.Endpoint(ctx, "")
	if err != nil {
		t.Fatalf("MinIOエンドポイントの取得に失敗しました: %v", err)
	}
	accessKey := "minioadmin"
	secretKey := "minioadmin"

	// テスト用のバケット名
	tempBucket := "test-temp-bucket"
	permBucket := "test-perm-bucket"

	// テスト用の設定
	cfg := &Config{
		Endpoint:        endpoint,
		AccessKey:       accessKey,
		SecretKey:       secretKey,
		UseSSL:          false,
		TemporaryBucket: tempBucket,
		PermanentBucket: permBucket,
		Region:          "auto",
		StorageType:     "minio",
	}

	// S3互換ストレージを作成
	storage, err := NewS3Storage(cfg)
	if err != nil {
		t.Fatalf("S3互換ストレージの作成に失敗しました: %v", err)
	}
	defer storage.Close()

	// テスト用のデータ
	testData := []byte("テストデータ")
	testID := "test-id-bucket-validation"
	testFilename := "test.txt"
	testMetadata := map[string]interface{}{
		"test-key": "test-value",
	}

	// 無効なバケット名のテストケース
	invalidBucketNames := []string{
		"UPPERCASE",         // 大文字を含む
		"special-chars!@#",  // 特殊文字を含む
		"with_underscore",   // アンダースコアを含む
		"with.dot",          // ドットを含む
		"with space",        // スペースを含む
	}

	for _, bucketName := range invalidBucketNames {
		// カスタムバケット名を指定してアップロード
		_, err := storage.Upload(
			context.Background(),
			testID,
			testFilename,
			bytes.NewReader(testData),
			testMetadata,
			true,
			bucketName,
		)

		// エラーが発生することを確認
		if err == nil {
			t.Errorf("無効なバケット名 '%s' でエラーが発生しませんでした", bucketName)
		} else {
			t.Logf("期待通りのエラー: %v", err)
		}
	}

	// 有効なバケット名のテスト
	validBucketName := "valid123bucket456"
	info, err := storage.Upload(
		context.Background(),
		testID,
		testFilename,
		bytes.NewReader(testData),
		testMetadata,
		true,
		validBucketName,
	)

	// エラーが発生しないことを確認
	if err != nil {
		t.Errorf("有効なバケット名 '%s' でエラーが発生しました: %v", validBucketName, err)
	} else {
		t.Logf("有効なバケット名 '%s' でアップロード成功: %s", validBucketName, info.ID)
	}
}

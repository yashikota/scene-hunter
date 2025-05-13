package storage

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/google/uuid"
)

// S3Storage はS3互換ストレージの実装
type S3Storage struct {
	client          *s3.Client
	temporaryBucket string
	permanentBucket string
	storageType     string
}

// NewS3Storage は新しいS3互換ストレージを作成する
func NewS3Storage(cfg *Config) (*S3Storage, error) {
	var endpointURL string
	var region string = "auto"

	if cfg.Region != "" {
		region = cfg.Region
	}

	// ストレージタイプに応じたエンドポイント設定
	switch cfg.StorageType {
	case "minio":
		protocol := "http"
		if cfg.UseSSL {
			protocol = "https"
		}
		endpointURL = fmt.Sprintf("%s://%s", protocol, cfg.Endpoint)
	case "r2":
		endpointURL = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", cfg.AccountID)
	default:
		// その他のS3互換サービス
		protocol := "http"
		if cfg.UseSSL {
			protocol = "https"
		}
		endpointURL = fmt.Sprintf("%s://%s", protocol, cfg.Endpoint)
	}

	// カスタムエンドポイントリゾルバ
	customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL: endpointURL,
			HostnameImmutable: true,
			SigningRegion: region,
		}, nil
	})

	// AWS設定の読み込み
	awsCfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithEndpointResolverWithOptions(customResolver),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.AccessKey,
			cfg.SecretKey,
			"",
		)),
		config.WithRegion(region),
	)
	if err != nil {
		return nil, fmt.Errorf("AWS設定の読み込みに失敗しました: %w", err)
	}

	// S3クライアントの初期化
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})

	// 一時バケットの確認と作成
	_, err = client.HeadBucket(context.Background(), &s3.HeadBucketInput{
		Bucket: aws.String(cfg.TemporaryBucket),
	})
	if err != nil {
		// バケットが存在しない場合は作成
		_, err = client.CreateBucket(context.Background(), &s3.CreateBucketInput{
			Bucket: aws.String(cfg.TemporaryBucket),
		})
		if err != nil {
			return nil, fmt.Errorf("一時バケットの作成に失敗しました: %w", err)
		}

		// ライフサイクルポリシーの設定
		lifecycleConfig := &s3.PutBucketLifecycleConfigurationInput{
			Bucket: aws.String(cfg.TemporaryBucket),
			LifecycleConfiguration: &types.BucketLifecycleConfiguration{
				Rules: []types.LifecycleRule{
					{
						ID:     aws.String("DeleteAfter1Day"),
						Status: "Enabled",
						Expiration: &types.LifecycleExpiration{
							Days: aws.Int32(1),
						},
					},
				},
			},
		}
		_, err = client.PutBucketLifecycleConfiguration(context.Background(), lifecycleConfig)
		if err != nil {
			return nil, fmt.Errorf("一時バケットのライフサイクルポリシー設定に失敗しました: %w", err)
		}
	}

	// 永続バケットの確認と作成
	_, err = client.HeadBucket(context.Background(), &s3.HeadBucketInput{
		Bucket: aws.String(cfg.PermanentBucket),
	})
	if err != nil {
		// バケットが存在しない場合は作成
		_, err = client.CreateBucket(context.Background(), &s3.CreateBucketInput{
			Bucket: aws.String(cfg.PermanentBucket),
		})
		if err != nil {
			return nil, fmt.Errorf("永続バケットの作成に失敗しました: %w", err)
		}
	}

	return &S3Storage{
		client:          client,
		temporaryBucket: cfg.TemporaryBucket,
		permanentBucket: cfg.PermanentBucket,
		storageType:     cfg.StorageType,
	}, nil
}

// Upload は画像をアップロードする
// isPermanent: trueの場合は永続バケット、falseの場合は一時バケット
// customBucket: 指定された場合は、そのバケットを使用（存在しない場合は作成）
func (s *S3Storage) Upload(ctx context.Context, id string, filename string, reader io.Reader, metadata map[string]interface{}, isPermanent bool, customBucket string) (*ImageInfo, error) {
	// IDが指定されていない場合は生成
	if id == "" {
		id = uuid.New().String()
	}

	// メタデータをS3用に変換
	s3Metadata := make(map[string]string)
	for k, v := range metadata {
		s3Metadata[k] = fmt.Sprintf("%v", v)
	}

	// オリジナルファイル名をメタデータに追加
	s3Metadata["Original-Filename"] = filename

	// ファイル名から拡張子を取得
	ext := strings.ToLower(filepath.Ext(filename))
	if ext != "" && ext[0] == '.' {
		ext = ext[1:]
	}

	// オブジェクト名を生成
	objectName := id
	if ext != "" {
		objectName = fmt.Sprintf("%s.%s", id, ext)
	}

	// バケットを選択
	var bucketName string
	if customBucket != "" {
		// カスタムバケットが指定された場合は、そのバケットを使用
		bucketName = customBucket
		// バケットが存在しない場合は作成
		err := s.ensureBucketExists(ctx, bucketName)
		if err != nil {
			return nil, fmt.Errorf("バケットの作成に失敗しました: %w", err)
		}
	} else if isPermanent {
		// 永続バケットを使用
		bucketName = s.permanentBucket
	} else {
		// 一時バケットを使用
		bucketName = s.temporaryBucket
	}

	// アップロード
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucketName),
		Key:         aws.String(objectName),
		Body:        reader,
		ContentType: aws.String(GetContentType(ext)),
		Metadata:    s3Metadata,
	})
	if err != nil {
		return nil, fmt.Errorf("オブジェクトのアップロードに失敗しました: %w", err)
	}

	// 画像情報を返す
	return &ImageInfo{
		ID:        id,
		Filename:  filename,
		Format:    ext,
		Metadata:  metadata,
		CreatedAt: time.Now(),
	}, nil
}

// ensureBucketExists はバケットが存在することを確認し、存在しない場合は作成する
func (s *S3Storage) ensureBucketExists(ctx context.Context, bucketName string) error {
	// バケット名のバリデーション
	if err := ValidateBucketName(bucketName); err != nil {
		return err
	}

	// バケットの存在確認
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(bucketName),
	})
	if err == nil {
		// バケットが既に存在する
		return nil
	}

	// バケットが存在しない場合は作成
	_, err = s.client.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(bucketName),
	})
	if err != nil {
		return fmt.Errorf("バケットの作成に失敗しました: %w", err)
	}

	return nil
}

// Get は画像を取得する
func (s *S3Storage) Get(ctx context.Context, id string) (io.ReadCloser, *ImageInfo, error) {
	// オブジェクト情報を取得
	info, err := s.GetInfo(ctx, id)
	if err != nil {
		return nil, nil, err
	}

	// オブジェクト名を生成
	objectName := id
	if info.Format != "" {
		objectName = fmt.Sprintf("%s.%s", id, info.Format)
	}

	// バケットを選択（永続バケットを使用）
	bucketName := s.permanentBucket

	// オブジェクトを取得
	result, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(objectName),
	})
	if err != nil {
		return nil, nil, fmt.Errorf("オブジェクトの取得に失敗しました: %w", err)
	}

	return result.Body, info, nil
}

// GetInfo は画像の情報を取得する
func (s *S3Storage) GetInfo(ctx context.Context, id string) (*ImageInfo, error) {
	// 一時バケットで検索
	info, err := s.getInfoFromBucket(ctx, id, s.temporaryBucket)
	if err == nil {
		return info, nil
	}

	// 永続バケットで検索
	info, err = s.getInfoFromBucket(ctx, id, s.permanentBucket)
	if err == nil {
		return info, nil
	}

	return nil, fmt.Errorf("オブジェクトが見つかりません: %s", id)
}

// getInfoFromBucket は指定されたバケットから画像情報を取得する
func (s *S3Storage) getInfoFromBucket(ctx context.Context, id string, bucketName string) (*ImageInfo, error) {
	// オブジェクトを検索
	result, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucketName),
		Prefix: aws.String(id),
	})
	if err != nil {
		return nil, fmt.Errorf("オブジェクトの検索に失敗しました: %w", err)
	}

	for _, object := range result.Contents {
		// IDで始まるオブジェクトを見つけた
		if strings.HasPrefix(*object.Key, id) {
			// オブジェクト情報を取得
			objInfo, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
				Bucket: aws.String(bucketName),
				Key:    object.Key,
			})
			if err != nil {
				return nil, fmt.Errorf("オブジェクト情報の取得に失敗しました: %w", err)
			}

			// 拡張子を取得
			ext := strings.ToLower(filepath.Ext(*object.Key))
			if ext != "" && ext[0] == '.' {
				ext = ext[1:]
			}

			// メタデータを取得
			metadata := make(map[string]interface{})
			for k, v := range objInfo.Metadata {
				metadata[k] = v
			}

			// オリジナルファイル名を取得
			filename := id
			for k, v := range objInfo.Metadata {
				if strings.EqualFold(k, "Original-Filename") {
					filename = v
					break
				}
			}

			return &ImageInfo{
				ID:        id,
				Filename:  filename,
				Size:      *objInfo.ContentLength,
				Format:    ext,
				Metadata:  metadata,
				CreatedAt: *objInfo.LastModified,
			}, nil
		}
	}

	return nil, fmt.Errorf("オブジェクトが見つかりません: %s", id)
}

// Delete は画像を削除する
func (s *S3Storage) Delete(ctx context.Context, id string) error {
	// 一時バケットで削除を試みる
	err := s.deleteFromBucket(ctx, id, s.temporaryBucket)
	if err == nil {
		return nil
	}

	// 永続バケットで削除を試みる
	err = s.deleteFromBucket(ctx, id, s.permanentBucket)
	if err == nil {
		return nil
	}

	return fmt.Errorf("オブジェクトが見つかりません: %s", id)
}

// deleteFromBucket は指定されたバケットから画像を削除する
func (s *S3Storage) deleteFromBucket(ctx context.Context, id string, bucketName string) error {
	// オブジェクトを検索
	result, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucketName),
		Prefix: aws.String(id),
	})
	if err != nil {
		return fmt.Errorf("オブジェクトの検索に失敗しました: %w", err)
	}

	for _, object := range result.Contents {
		// IDで始まるオブジェクトを見つけた
		if strings.HasPrefix(*object.Key, id) {
			// オブジェクトを削除
			_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
				Bucket: aws.String(bucketName),
				Key:    object.Key,
			})
			if err != nil {
				return fmt.Errorf("オブジェクトの削除に失敗しました: %w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("オブジェクトが見つかりません: %s", id)
}

// List は画像の一覧を取得する
func (s *S3Storage) List(ctx context.Context, limit int, offset int, sortBy string) ([]*ImageInfo, int, error) {
	// 一時バケットの画像を取得
	tempImages, tempCount, err := s.listFromBucket(ctx, limit, offset, sortBy, s.temporaryBucket)
	if err != nil {
		return nil, 0, err
	}

	// 永続バケットの画像を取得
	permImages, permCount, err := s.listFromBucket(ctx, limit, offset, sortBy, s.permanentBucket)
	if err != nil {
		return nil, 0, err
	}

	// 結果をマージ
	images := append(tempImages, permImages...)
	count := tempCount + permCount

	return images, count, nil
}

// listFromBucket は指定されたバケットから画像の一覧を取得する
func (s *S3Storage) listFromBucket(ctx context.Context, limit int, offset int, sortBy string, bucketName string) ([]*ImageInfo, int, error) {
	// オブジェクトを一覧取得
	result, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucketName),
	})
	if err != nil {
		return nil, 0, fmt.Errorf("オブジェクトの一覧取得に失敗しました: %w", err)
	}

	var imageInfos []*ImageInfo
	var count int

	for _, object := range result.Contents {
		count++

		// オフセットをスキップ
		if count <= offset {
			continue
		}

		// オブジェクト情報を取得
		objInfo, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
			Bucket: aws.String(bucketName),
			Key:    object.Key,
		})
		if err != nil {
			return nil, 0, fmt.Errorf("オブジェクト情報の取得に失敗しました: %w", err)
		}

		// IDを取得
		id := *object.Key
		ext := filepath.Ext(id)
		if ext != "" {
			id = id[:len(id)-len(ext)]
		}

		// 拡張子を取得
		format := ""
		if ext != "" && ext[0] == '.' {
			format = ext[1:]
		}

		// メタデータを取得
		metadata := make(map[string]interface{})
		for k, v := range objInfo.Metadata {
			metadata[k] = v
		}

		// オリジナルファイル名を取得
		filename := id
		for k, v := range objInfo.Metadata {
			if strings.EqualFold(k, "Original-Filename") {
				filename = v
				break
			}
		}

		imageInfos = append(imageInfos, &ImageInfo{
			ID:        id,
			Filename:  filename,
			Size:      *objInfo.ContentLength,
			Format:    format,
			Metadata:  metadata,
			CreatedAt: *objInfo.LastModified,
		})

		// リミットに達したら終了
		if limit > 0 && len(imageInfos) >= limit {
			break
		}
	}

	return imageInfos, count, nil
}

// Close はストレージ接続を閉じる
func (s *S3Storage) Close() error {
	// S3クライアントには明示的なClose()メソッドがないため、何もしない
	return nil
}

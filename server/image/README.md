# 画像処理サーバー

S3互換サーバーに対応した画像アップロード、変換、保存、取得、削除、一覧取得機能を持つGoサーバーです。

## 機能

- 画像のアップロード、取得、削除、一覧取得
- 画像変換（リサイズ、フォーマット変換）
- S3互換ストレージ（MinIO）との連携
- 永続/非永続ストレージの選択
- カスタムバケットの動的作成と利用
- JWT認証
- マジックナンバーによるファイル検証（偽装ファイル対策）

## 技術スタック

- 言語: Go
- フレームワーク: Echo
- 画像処理: 標準ライブラリ（image）
- S3クライアント: Minio Go SDK
- 設定管理: viper (toml対応)
- ロギング: slog
- 認証: JWT (lestrrat-go/jwx)

## ディレクトリ構成

```
server/image/
├── cmd/
│   ├── main.go               # メインエントリーポイント
│   └── server/
│       └── main.go           # 代替エントリーポイント
├── config/
│   ├── config.go             # 設定読み込み処理
│   └── config.toml           # 設定ファイル
├── internal/
│   ├── api/
│   │   ├── handler.go        # APIハンドラー
│   │   └── router.go         # ルーティング
│   ├── auth/
│   │   ├── auth.go           # 認証インターフェース
│   │   └── jwt.go            # JWT認証
│   ├── storage/
│   │   ├── minio.go          # MinIOクライアント
│   │   └── storage.go        # ストレージインターフェース
│   └── transform/
│       └── image.go          # 画像変換処理
├── pkg/
│   ├── model/
│   │   └── image.go          # 画像モデル
│   └── util/
│       ├── error.go          # エラーハンドリング
│       └── validator.go      # バリデーション
├── Dockerfile                # Dockerファイル
├── go.mod                    # Goモジュール定義
└── go.sum                    # Goモジュール依存関係
```

## 設定

設定は `config/config.toml` ファイルで管理されています。主な設定項目は以下の通りです：

- サーバー設定（ポート、デバッグモード）
- 認証設定（JWT）
- ストレージ設定（MinIO接続情報）
- 画像設定（対応フォーマット、最大サイズ）
- 変換プリセット（サムネイル、中サイズなど）
- セキュリティ設定（ファイル検証、認証）

## API仕様

### 認証

認証方式は設定ファイルで指定可能です。

#### JWT認証

```
Authorization: Bearer <token>
```

### エンドポイント

#### 画像アップロード

```
POST /v1/images
Content-Type: multipart/form-data

form-data:
- file: 画像ファイル (必須)
- metadata: メタデータ (オプション、JSON文字列)
- transform: 変換プリセット名 (オプション、カンマ区切りで複数指定可)
- is_permanent: 永続保存するかどうか (オプション、true/false、デフォルトはtrue)
- bucket_name: カスタムバケット名 (オプション、小文字と数字のみ使用可能、指定した場合はそのバケットに保存、存在しない場合は自動作成)
```

#### 画像取得

```
GET /v1/images/{id}
```

クエリパラメータ:
- `preset`: 変換プリセット名 (オプション)

#### 画像メタデータ取得

```
GET /v1/images/{id}/metadata
```

#### 画像一覧取得

```
GET /v1/images
```

クエリパラメータ:
- `limit`: 取得件数 (デフォルト: 20)
- `offset`: オフセット (デフォルト: 0)
- `sort`: ソート順 (created_at:asc, created_at:desc など)

#### 画像削除

```
DELETE /v1/images/{id}
```

## ビルドと実行

### ローカル環境での実行

```bash
# 依存関係のインストール
go mod download

# ビルド
go build -o image-server ./cmd/main.go

# 実行
./image-server

# テストの実行
go test ./...

# ユニットテストのみ実行（インテグレーションテストをスキップ）
go test -short ./...
```

### Dockerでの実行

```bash
# イメージのビルド
docker build -t image-server .

# コンテナの実行
docker run -p 8080:8080 image-server
```

## テスト

画像処理サーバーには以下の種類のテストが実装されています：

### ユニットテスト

個々のコンポーネントの機能をテストします：

- `pkg/util/file_test.go`: マジックナンバーによるファイル検証機能のテスト
- `pkg/util/validator_test.go`: バリデーション機能のテスト

### インテグレーションテスト

実際の依存関係を使用したテスト：

- `internal/storage/s3_test.go`: S3のテスト（testcontainersを使用）

### テストの実行方法

すべてのテストを実行：

```bash
go test ./...
```

## セキュリティ対策

### ファイル検証

画像ファイルのアップロード時には、以下の検証が行われます：

1. **拡張子チェック**: 設定ファイルで指定された拡張子（jpg、pngなど）かどうかを確認
2. **サイズチェック**: 設定ファイルで指定された最大サイズ以下かどうかを確認
3. **マジックナンバーチェック**: ファイルヘッダーを解析して実際のファイル形式を検証し、拡張子と一致するか確認

これにより、拡張子を偽装した不正なファイルのアップロードを防止します。

### 認証

認証方式は設定ファイルで指定可能です：

**JWT認証**: 既存の認証システムと統合しやすい

## MinIOの設定

MinIOサーバーを起動する必要があります。Docker Composeを使用する場合の例：

```yaml
version: '3'

services:
  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  minio_data:
```

## ライセンス

MIT

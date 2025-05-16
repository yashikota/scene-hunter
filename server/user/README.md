# Scene Hunter ユーザープロフィール管理サーバー

HonoとCloudflare D1を使用したユーザープロフィール管理サーバーです。Supabase Authと連携して認証機能を提供します。

## 目次

- [機能概要](#機能概要)
- [セットアップ](#セットアップ)
- [API仕様](#api仕様)
  - [認証API](#認証api)
  - [プレイヤーAPI](#プレイヤーapi)
- [開発](#開発)
- [デプロイ](#デプロイ)

## 機能概要

- プレイヤーの登録・ログイン・認証
- プレイヤー情報の取得と更新
- プレイヤースコアの管理
- JWT認証によるセキュアなAPI

## セットアップ

### 依存関係のインストール

```bash
pnpm install
```

### データベースの作成

```bash
# D1データベースの作成
npx wrangler d1 create scene-hunter-user-db

# マイグレーションの実行
npx wrangler d1 execute scene-hunter-user-db --file=./migrations/0000_initial.sql
npx wrangler d1 execute scene-hunter-user-db --file=./migrations/0001_add_indexes.sql
npx wrangler d1 execute scene-hunter-user-db --file=./migrations/0002_migrations_table.sql
```

## API仕様

### 認証API

#### プレイヤー登録

新しいプレイヤーを登録します。匿名アカウントが作成され、アクセストークンとリフレッシュトークンが返されます。

- **エンドポイント**: `POST /auth/register`
- **認証**: 不要
- **リクエスト本文**:

```json
{
  "name": "プレイヤー名" // 1-12文字
}
```

- **レスポンス**:

```json
{
  "player_id": "uuid-v4-string",
  "access_token": "jwt-token-string",
  "refresh_token": "refresh-token-string",
  "expires_in": 3600
}
```

- **エラーレスポンス**:
  - `400 Bad Request`: リクエストが不正
  - `409 Conflict`: プレイヤー名が既に使用されている
  - `500 Internal Server Error`: サーバーエラー

- **使用例**:

```bash
curl -X POST http://localhost:8787/auth/register \
  --json '{"name": "Player1"}'
```

#### プレイヤーログイン

既存のプレイヤーIDを使用してログインします。

- **エンドポイント**: `POST /auth/login`
- **認証**: 不要
- **リクエスト本文**:

```json
{
  "player_id": "uuid-v4-string"
}
```

- **レスポンス**:

```json
{
  "access_token": "jwt-token-string",
  "refresh_token": "refresh-token-string",
  "expires_in": 3600
}
```

- **エラーレスポンス**:
  - `400 Bad Request`: リクエストが不正
  - `401 Unauthorized`: 認証エラー
  - `404 Not Found`: プレイヤーが見つからない
  - `500 Internal Server Error`: サーバーエラー

- **使用例**:

```bash
curl -X POST http://localhost:8787/auth/login \
  --json '{"player_id": "uuid-v4-string"}'
```

#### トークン更新

リフレッシュトークンを使用して新しいアクセストークンを取得します。

- **エンドポイント**: `POST /auth/refresh`
- **認証**: Bearer認証
- **リクエスト本文**:

```json
{
  "refresh_token": "refresh-token-string"
}
```

- **レスポンス**:

```json
{
  "access_token": "new-jwt-token-string",
  "refresh_token": "new-refresh-token-string",
  "expires_in": 3600
}
```

- **エラーレスポンス**:
  - `400 Bad Request`: リクエストが不正
  - `401 Unauthorized`: 無効なリフレッシュトークン
  - `500 Internal Server Error`: サーバーエラー

- **使用例**:

```bash
curl -X POST http://localhost:8787/auth/refresh \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-access-token" \
  -d '{"refresh_token": "your-refresh-token"}'
```

### プレイヤーAPI

#### プレイヤー情報取得

プレイヤーIDを使用してプレイヤー情報を取得します。

- **エンドポイント**: `GET /players/:player_id`
- **認証**: Bearer認証
- **パスパラメータ**:
  - `player_id`: プレイヤーID (UUID)
- **レスポンス**:

```json
{
  "player_id": "uuid-v4-string",
  "name": "プレイヤー名",
  "created_at": 1715000000,
  "total_score": 100
}
```

- **エラーレスポンス**:
  - `400 Bad Request`: リクエストが不正
  - `401 Unauthorized`: 認証エラー
  - `404 Not Found`: プレイヤーが見つからない
  - `500 Internal Server Error`: サーバーエラー

- **使用例**:

```bash
curl -X GET http://localhost:8787/players/uuid-v4-string \
  -H "Authorization: Bearer your-access-token"
```

#### プレイヤー名更新

プレイヤー名を更新します。自分自身のプレイヤー名のみ更新可能です。

- **エンドポイント**: `PUT /players/:player_id`
- **認証**: Bearer認証
- **パスパラメータ**:
  - `player_id`: プレイヤーID (UUID)
- **リクエスト本文**:

```json
{
  "name": "新しいプレイヤー名" // 1-12文字
}
```

- **レスポンス**:

```json
{
  "player_id": "uuid-v4-string",
  "name": "新しいプレイヤー名",
  "created_at": 1715000000,
  "total_score": 100
}
```

- **エラーレスポンス**:
  - `400 Bad Request`: リクエストが不正
  - `401 Unauthorized`: 認証エラー
  - `403 Forbidden`: 権限がない（他のプレイヤーの名前を更新しようとした）
  - `404 Not Found`: プレイヤーが見つからない
  - `500 Internal Server Error`: サーバーエラー

- **使用例**:

```bash
curl -X PUT http://localhost:8787/players/uuid-v4-string \
  -H "Authorization: Bearer your-access-token" \
  --json '{"name": "NewName"}'
```

#### プレイヤースコア更新

プレイヤーの総スコアを更新します。このエンドポイントはサーバー間通信用で、APIキーによる認証が必要です。

- **エンドポイント**: `PUT /players/:player_id/score`
- **認証**: APIキー (`X-API-Key` ヘッダー)
- **パスパラメータ**:
  - `player_id`: プレイヤーID (UUID)
- **リクエスト本文**:

```json
{
  "total_score": 150
}
```

- **レスポンス**:

```json
{
  "player_id": "uuid-v4-string",
  "name": "プレイヤー名",
  "created_at": 1715000000,
  "total_score": 150
}
```

- **エラーレスポンス**:
  - `400 Bad Request`: リクエストが不正
  - `403 Forbidden`: 無効なAPIキー
  - `404 Not Found`: プレイヤーが見つからない
  - `500 Internal Server Error`: サーバーエラー

- **使用例**:

```bash
curl -X PUT http://localhost:8787/players/uuid-v4-string/score \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-server-api-key" \
  -d '{"total_score": 150}'
```

#### 全プレイヤー取得

全プレイヤーのリストを取得します。

- **エンドポイント**: `GET /players`
- **認証**: Bearer認証
- **クエリパラメータ**:
  - `limit`: 取得する最大件数 (デフォルト: 100)
  - `offset`: オフセット (デフォルト: 0)
- **レスポンス**:

```json
[
  {
    "player_id": "uuid-v4-string-1",
    "name": "プレイヤー1",
    "created_at": 1715000000,
    "total_score": 100
  },
  {
    "player_id": "uuid-v4-string-2",
    "name": "プレイヤー2",
    "created_at": 1715000100,
    "total_score": 200
  }
]
```

- **エラーレスポンス**:
  - `401 Unauthorized`: 認証エラー
  - `500 Internal Server Error`: サーバーエラー

- **使用例**:

```bash
curl -X GET "http://localhost:8787/players?limit=10&offset=0" \
  -H "Authorization: Bearer your-access-token"
```

## 開発

ローカル開発サーバーを起動します：

```bash
pnpm dev
```

型定義の生成：

```bash
pnpm cf-typegen
```

## デプロイ

Cloudflare Workersにデプロイします：

```bash
pnpm deploy
```

リモートデータベースにマイグレーションを適用：

```bash
npx wrangler d1 execute scene-hunter-user-db --file=./migrations/0000_initial.sql --remote
npx wrangler d1 execute scene-hunter-user-db --file=./migrations/0001_add_indexes.sql --remote
npx wrangler d1 execute scene-hunter-user-db --file=./migrations/0002_migrations_table.sql --remote
```

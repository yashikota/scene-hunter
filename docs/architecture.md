# 設計

## アーキテクチャ

クリーンアーキテクチャに基づいた層構造を採用している。依存関係は外側から内側への一方向のみ許可される。

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '14px'}}}%%
flowchart TB
    subgraph outer["外側: Frameworks & Drivers"]
        direction TB
        subgraph infra_layer[" "]
            direction LR
            handler["handler<br/>(HTTP/gRPC)"]
            kvs["infra/kvs"]
            blob["infra/blob"]
            gemini["infra/gemini"]
            db["infra/db"]
            repo["infra/repository"]
        end
    end

    subgraph middle["中間: Interface Adapters"]
        direction TB
        subgraph service_layer[" "]
            service["service<br/>(Use Cases + Interfaces)"]
        end
    end

    subgraph inner["内側: Enterprise Business Rules"]
        direction TB
        subgraph domain_layer[" "]
            domain["domain<br/>(Entities)"]
        end
    end

    handler --> service
    service --> domain
    repo --> domain
    repo -.->|implements| service
    kvs -.->|implements| service
    blob -.->|implements| service
    gemini -.->|implements| service

    style inner fill:#ffffcc,stroke:#333
    style middle fill:#ccffcc,stroke:#333
    style outer fill:#ccccff,stroke:#333
```

依存の方向は **外側 → 内側** のみ。内側は外側を知らない。

## ディレクトリ構造

```
server/
├── cmd/
│   ├── main.go                # エントリーポイント
│   └── di/                    # DIコンテナ（Composition Root）
│       ├── container.go       # uber/dig を使用したDIコンテナ
│       ├── handlers.go        # ハンドラ登録
│       ├── auth_service.go    # Auth Service ラッパー
│       ├── image_service.go   # Image Service ラッパー
│       └── interceptor.go     # エラーログインターセプター
│
└── internal/
    ├── domain/                    # ドメイン層（最内層）
    │   ├── game/                  # ゲームEntity・ビジネスロジック
    │   ├── room/                  # ルームEntity
    │   ├── auth/                  # 認証関連ValueObject
    │   ├── user/                  # ユーザーEntity
    │   └── image/                 # 画像Entity
    │
    ├── service/                   # サービス層（ユースケース）
    │   ├── repository.go          # Repositoryインターフェース定義
    │   ├── external.go            # 外部サービスインターフェース定義
    │   ├── errors.go              # 共通エラー定義
    │   ├── game/                  # ゲーム関連ユースケース
    │   ├── room/                  # ルーム管理
    │   ├── auth/                  # 認証・トークン管理
    │   ├── image/                 # 画像アップロード
    │   ├── gemini/                # AI画像解析サービス
    │   ├── health/                # ヘルスチェック
    │   ├── status/                # ステータス確認
    │   └── middleware/            # 認証ミドルウェア
    │
    ├── handler/                   # ハンドラ層（プレゼンテーション）
    │   ├── game/                  # ゲームAPI
    │   ├── auth/                  # 認証API
    │   └── image/                 # 画像API
    │
    ├── infra/                     # インフラ層（外部接続）
    │   ├── repository/            # Repository実装
    │   │   ├── game_kvs.go        # KVS使用
    │   │   ├── room_kvs.go        # KVS使用
    │   │   ├── anon_kvs.go        # KVS使用
    │   │   └── identity_db.go     # PostgreSQL使用
    │   ├── kvs/                   # Valkey(Redis互換)クライアント
    │   ├── blob/                  # MinIO/S3互換ストレージクライアント
    │   ├── gemini/                # Google Gemini AIクライアント
    │   └── db/                    # PostgreSQLクライアント
    │       └── queries/           # sqlc生成コード
    │
    ├── config/                    # 設定管理
    ├── util/                      # ユーティリティ
    │   ├── chrono/                # 時刻操作
    │   └── errors/                # エラーハンドリング
    └── testutil/                  # テスト用ユーティリティ
```

## DIコンテナ（Composition Root）

`cmd/di` はアプリケーションの Composition Root として機能する。uber/dig を使用して依存性注入を行い、全ての具体的な実装をワイヤリングする。

- `cmd/di` は infra 層に依存することが許可される唯一のパッケージ
- ここで interface と実装を結びつける
- ハンドラの登録もここで行う

## 依存関係

矢印は「依存する」方向を示す。インターフェースは利用側（service）で定義するGoイディオムに従っている。

```mermaid
flowchart TB
    subgraph presentation["プレゼンテーション層"]
        handler["handler"]
    end

    subgraph application["アプリケーション層"]
        service["service(インターフェース定義 + ユースケース実装)"]
    end

    subgraph domain_layer["ドメイン層"]
        domain["domain(Entity, ValueObject)"]
    end

    subgraph infrastructure["インフラ層"]
        infra_repo["infra/repository"]
        infra_kvs["infra/kvs"]
        infra_blob["infra/blob"]
        infra_gemini["infra/gemini"]
    end

    handler --> service
    service --> domain

    infra_repo -.->|implements| service
    infra_repo --> domain
    infra_kvs -.->|implements| service
    infra_blob -.->|implements| service
    infra_gemini -.->|implements| service
```

### 許可される依存

| From | To | 説明 |
|------|-----|------|
| cmd/di | infra/* | DIコンテナは具体的な実装をワイヤリングする |
| cmd/di | service/* | DIコンテナはサービスをワイヤリングする |
| cmd/di | handler/* | DIコンテナはハンドラを登録する |
| handler | service | ハンドラはサービスを呼び出す |
| service | domain/* | ドメインロジック・Entity使用 |
| infra/repository | service | Repositoryインターフェースを実装 |
| infra/repository | domain/* | Entityの永続化 |
| infra/kvs, blob, gemini | service | 外部サービスインターフェースを実装 |

### 禁止される依存

- `domain` → `service`, `handler`, `infra`（ドメインは外部に依存しない）
- `service` → `infra`（サービスはインターフェース経由でのみアクセス）
- `handler` → `infra`（ハンドラは直接インフラにアクセスしない）

※ `cmd/di` は Composition Root として特別扱い。全ての具体実装を知る必要がある。

## 技術スタック

### Server

| 用途 | 技術 |
|------|------|
| 言語 | Go |
| API定義 | Protocol Buffers |
| RPC | Connect RPC |
| RDB | PostgreSQL（ユーザー情報） |
| KVS | Valkey（ルーム・ゲーム情報） |
| オブジェクトストレージ | RustFS（画像） |
| AI | Google Gemini（ヒント生成） |

### Web

| 用途 | 技術 |
|------|------|
| 言語 | TypeScript |
| ルーティング | TanStack Router |
| データフェッチ | TanStack Query |
| UIコンポーネント | shadcn/ui |
| 状態管理 | Jotai |
| URLクエリ状態 | nuqs |

# 設計

## アーキテクチャ

層の名前とディレクトリ名、説明を記述している  

- ドメイン層(`domain/`): プリミティブなビジネスロジックを定義する
- サービス層(`service/`): ユーザーやAPIが操作する単位の振る舞いを定義する
- インフラ層(`infra/`): DBやKVSなどの外部サービスの具体的な実装をする

依存関係は `domain` -> `service` -> `infra` の順となる  
決して `domain` は `service` に依存してはならず、 `service` も `infra` に依存してはならない  

## 技術スタック

### Server

- Go
- protobuf
- Connect RPC
- Postgres (ユーザー情報)
- Valkey (部屋情報)
- RustFS (画像)

### Web

- TypeScript
- TanStack Router/Query
- shadcn/ui
- Jotai
- nuqs

# 設計

## アーキテクチャ

層の名前とディレクトリ名、説明を記述している  

- ドメイン層(`domain/`): Entity、ValueObject、DomainServiceなどの純粋なビジネスロジックを定義する
- リポジトリ層(`repository/`): データの永続化・取得のためのインターフェースを定義する
- サービス層(`service/`): ユースケースを実装し、複数のドメインオブジェクトやリポジトリを組み合わせる
- インフラ層(`infra/`): DBやKVSなどの外部サービスとの接続、Repositoryインターフェースの具体的な実装を行う

依存関係は以下の通り  

- `domain` ← `service`（ServiceはDomainに依存）
- `repository` ← `service`（ServiceはRepositoryインターフェースに依存）
- `domain` ← `infra/repository`（Repository実装はDomainに依存）
- `repository` ← `infra/repository`（Repository実装はRepositoryインターフェースを実装）

決して `domain` は `service` に依存してはならず、 `service` や `repository` も `infra` の具体的な実装に依存してはならない  

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

# DB

論物変換ルールは `dict.md` に記載している  

## 禁止ルール

- text型は使わずにvarcharを使う
- check制約は使用しない
- [NULL撲滅委員会](https://mickindex.sakura.ne.jp/database/db_getout_null.html) に従って原則NULLを使用しない
- UUIDはUUID型を使う
- 将来の拡張性のためフラグでもBool型は使わずにvarcharによるstatusなどの管理にする

## 開発フロー

1. スキーマ変更

`server/db/schema/schema.sql` を編集してテーブル定義を変更する

2. スキーマ差分確認

```sh
task db/diff
```

現在のデータベースとスキーマファイルの差分を確認する

3. スキーマ適用

```sh
task db/apply
```

変更をデータベースに適用する（Atlasが自動的にマイグレーションを実行）

4. SQLクエリ作成

`server/db/queries/*.sql` にクエリを追加する

- sqlcの記法に従ってクエリを記述する
- クエリ名は関数名として使用されるので分かりやすい名前にする

5. コード生成

```sh
task db/generate
```

sqlcがSQLクエリからGoコードを自動生成する（`server/internal/infra/db/queries/` に出力される）

6. 実装

生成されたクエリを使用してビジネスロジックを実装する

7. lint/test

```sh
task go/test
task go/check
```

## 注意事項

- スキーマ変更後は必ず `task db/generate` を実行してコードを再生成する
- スキーマ適用前に `task db/diff` で差分を確認する習慣をつける
- クエリ追加後も `task db/generate` でコード生成が必要

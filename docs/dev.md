# dev

## セットアップ

1. Install [aqua](https://aquaproj.github.io/docs/install)
2. `aqua i -l`
3. `task setup`
4. `task up`

## 開発フロー

1. `proto/` にAPIの型情報を定義
2. `task buf/gen` でprotoからコード生成
3. `server/domain` でコアロジックを実装
4. 生成コードを元に `server/service` でAPIの振る舞いを実装
5. `server/infra` でDBやKVSなどの物理的な操作を実装
6. ユニットテストを実装する
7. `task go/check` でlintとtestを実行してエラーがなくなるまで修正する
8. `web/` でフロントエンドの作成

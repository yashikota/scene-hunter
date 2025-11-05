# scene-hunter

## Set Up

1. Install [aqua](https://aquaproj.github.io/docs/install)
2. `aqua i -l`
3. `task setup`
4. `task up`

## 開発フロー

1. `proto/` に型情報を定義
2. `task buf/gen` でprotoからコード生成
3. 生成コードを元に `server/` でロジック実装
4. `web/` でフロントエンドの作成

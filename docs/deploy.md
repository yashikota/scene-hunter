# デプロイ手順

本番：<https://scene-hunter.scene-hunter.workers.dev>（Cloudflare アカウント `scene-hunter`、ID `4723b654d7c87a32f3a5b3e260da5eec`）

Void がデプロイ時に作るリソース（ID は `void.lock.json`）：

- KV（binding `KV`）
- R2 バケット `scene-hunter-storage`（binding `STORAGE`）
- Rate Limiting（`RL_CREATE` など、`void.config.ts`）

## 1. 鍵を作る

サーバーの署名鍵（Ed25519）と HMAC の鍵を作る。秘密の値は画面にもファイルにも残さず、そのまま `void secret put` に渡す。表示するのは公開鍵だけにする。

```sh
OUT=$(node -e "
const { subtle } = globalThis.crypto;
const b64u = (b) => Buffer.from(b).toString('base64url');
(async () => {
  const k = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  console.log(b64u(await subtle.exportKey('pkcs8', k.privateKey)) + ' ' + b64u(await subtle.exportKey('raw', k.publicKey)));
})();")
printf %s "${OUT%% *}" | npx void secret put SERVER_SIGNING_KEY
echo "VITE_SERVER_PUBLIC_KEY=${OUT##* }"   # 公開鍵。下の「現在の公開鍵」を書き換える
unset OUT

node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" \
  | npx void secret put HMAC_SECRET
```

署名鍵を作り直したら、同じ公開鍵でビルドし直す（公開鍵はブラウザの JS に埋め込まれる）。

現在の公開鍵（秘密ではない）：

```
VITE_SERVER_PUBLIC_KEY=60Zo_80nnrlNyFbUl6XrDFko36Vaqj0KTmh0yduAG34
```

## 2. API トークン（ダッシュボードで作る）

cf CLI の OAuth では API トークンを作れないので、ダッシュボードで作る。

- Realtime（MoQ）を編集できるアカウント API トークン → `CF_API_TOKEN`
- R2 の API トークン（Object Read & Write、バケット `scene-hunter-storage` に限定） → `R2_ACCESS_KEY_ID` と `R2_SECRET_ACCESS_KEY`

## 3. 秘密情報を登録する

`void secret put` は標準入力から値を読む。

```sh
printf %s 4723b654d7c87a32f3a5b3e260da5eec | npx void secret put CF_ACCOUNT_ID
printf %s scene-hunter-storage | npx void secret put R2_BUCKET
npx void secret put CF_API_TOKEN          # 対話で入力（伏せ字）
npx void secret put R2_ACCESS_KEY_ID
npx void secret put R2_SECRET_ACCESS_KEY
npx void secret put QWEN_API_KEY          # 任意。Workers AI の無料枠を超えたときの切り替え先
npx void secret list
```

`env.ts` の必須の値（`QWEN_API_KEY` 以外）がリモートに無いと、`void deploy` はアップロードしない。

注意：Void は `CF_API_TOKEN` という環境変数を Cloudflare の認証情報として読む。デプロイするシェルに `.env` の `CF_API_TOKEN` を export しない。

## 4. R2 の CORS と Lifecycle

```sh
CLOUDFLARE_ACCOUNT_ID=4723b654d7c87a32f3a5b3e260da5eec scripts/r2-setup.sh
```

本番のオリジンと `http://localhost:5173` からの PUT と GET（ヘッダー `content-type`）を許し、`rooms/` 以下を 1 日で消す。

## 5. デプロイ

```sh
VITE_SERVER_PUBLIC_KEY=60Zo_80nnrlNyFbUl6XrDFko36Vaqj0KTmh0yduAG34 npx void deploy --platform cloudflare
curl https://scene-hunter.scene-hunter.workers.dev/api/health   # {"ok":true}
```

Void はブラウザでログインする（`void cloudflare login`）。ブラウザを使えないときは `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` をシェルに渡す。

`VITE_*` の値は `.env` からは読まれないので、ビルドするシェルで渡す。

## ローカル開発

`pnpm dev` は `.env` とシェルの値を読む。必須の値が無いと警告を出すが起動はする。部屋を作るなどサーバーの秘密情報を使う API は、値が無いと `missing secret <NAME>` で失敗する。

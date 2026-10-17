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
  - アカウント `scene-hunter` の MoQ Relays を作成・削除できること。確かめ方：`curl -H "Authorization: Bearer <token>" https://api.cloudflare.com/client/v4/accounts/4723b654d7c87a32f3a5b3e260da5eec/moq/relays` が `"success": true` を返す。
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
CLOUDFLARE_WORKERS_SUBDOMAIN=scene-hunter \
VITE_SERVER_PUBLIC_KEY=60Zo_80nnrlNyFbUl6XrDFko36Vaqj0KTmh0yduAG34 \
  npx void deploy --platform cloudflare
curl https://scene-hunter.scene-hunter.workers.dev/api/health   # {"ok":true}
```

Void はブラウザでログインする（`void cloudflare login`）。ブラウザを使えないときは `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` をシェルに渡す。

`VITE_*` の値は `.env` からは読まれないので、ビルドするシェルで渡す。`CLOUDFLARE_WORKERS_SUBDOMAIN` は、Void がデプロイ前の版をプレビュー URL で確かめるのに使う（成功すると Void が覚える）。

### 初回だけ：workers.dev を有効にする

最初のデプロイでは Worker の workers.dev とプレビュー URL が無効のままになり、Void の確認（`/__void/ready`）が通らなかった。`void.config.ts` の `workers_dev` と `preview_urls` は確認が通った後に反映されるため。一度だけ API で有効にした：

```sh
curl -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'content-type: application/json' \
  -d '{"enabled":true,"previews_enabled":true}' \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/scene-hunter/subdomain"
```

## 既知の問題

### Void 1.1.11：秘密情報があると Rate Limiting binding をアップロードできない

- 上流の Issue：<https://github.com/voidzero-dev/void/issues/462>
- 再現：`void.config.ts` の `cloudflare.ratelimits` に binding を 1 つ置き、`void secret put` で秘密情報を 1 つ登録してから `void deploy --platform cloudflare` を実行する。`Cloudflare binding RL_CREATE cannot be uploaded with pinned secrets.` で止まる。
- 原因：Worker に秘密情報があると、Void は秘密情報を引き継ぐ専用のアップロード（`uploadPinnedCloudflareVersion`）を使う。そこで binding を API の形に直す `bindingsFromOutput` に Rate Limiting の case が無く、`default` で例外を投げる。
- 対処：`patches/void@1.1.11.patch`（`pnpm-workspace.yaml` の `patchedDependencies`）で case を足した。ビルド出力では binding が `{ type: "rate-limit", namespace, simple: { limit, period } }` の形で来る（`@cloudflare/codemods` が `ratelimits` を `bindings.rateLimit({ namespace, simple })` に変え、`@cloudflare/config` の型は `type: "rate-limit"`）。これを API の `{ name, type: "ratelimit", namespace_id, simple }` に直す。Issue の修正案は `case "ratelimit"` と `namespaceId` を使っているが、1.1.11 の実際の出力とは名前が違う。
- 上流で直ったら、Void を上げてパッチと `patchedDependencies` の行を消す。

### Rate Limiting は厳密ではない

Cloudflare の Rate Limiting はデータセンターごとに数え、結果の反映が遅れる。`RL_CREATE`（60 秒に 2 回）でも、続けて 10 回送ると 429 になるのは 6 回目前後からだった。

## ローカル開発

`pnpm dev` は `.env` とシェルの値を読む。必須の値が無いと警告を出すが起動はする。部屋を作るなどサーバーの秘密情報を使う API は、値が無いと `missing secret <NAME>` で失敗する。

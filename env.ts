import { defineEnv, string } from 'void/env';

// 秘密情報は `void secret put` で登録する（手順は docs/deploy.md）。
// void deploy は必須の値がリモートに無ければアップロードを止める。
// QWEN_API_KEY は Workers AI の無料枠を超えたときの切り替え先なので、無くても動く。
// VITE_SERVER_PUBLIC_KEY は公開値で、ビルドするシェルの環境変数から渡す。
export default defineEnv({
  HMAC_SECRET: string(),
  SERVER_SIGNING_KEY: string(),
  CF_API_TOKEN: string(),
  CF_ACCOUNT_ID: string(),
  R2_ACCESS_KEY_ID: string(),
  R2_SECRET_ACCESS_KEY: string(),
  R2_BUCKET: string(),
  QWEN_API_KEY: string().optional(),
  VITE_SERVER_PUBLIC_KEY: string(),
});

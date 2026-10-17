import { defineEnv, string } from 'void/env';

// 秘密情報はデプロイ時に `void secret put` で登録する。
// ローカル開発とテストでは未設定でも起動できるよう optional にしている。
export default defineEnv({
  HMAC_SECRET: string().optional(),
  SERVER_SIGNING_KEY: string().optional(),
  CF_API_TOKEN: string().optional(),
  CF_ACCOUNT_ID: string().optional(),
  R2_ACCESS_KEY_ID: string().optional(),
  R2_SECRET_ACCESS_KEY: string().optional(),
  R2_BUCKET: string().optional(),
  QWEN_API_KEY: string().optional(),
  VITE_SERVER_PUBLIC_KEY: string().optional(),
});

# R2 署名付き URL 検証 (2026-10-17)

写真を R2 へ直接アップロードする方式で、署名付き PUT によりサイズ・形式を制限できるかを検証した。
アカウント `scene-hunter`、非公開バケット `sh-verify-r2`（検証後に削除）、署名は `aws4fetch`。

## 結果

| 確認したこと | 結果 |
| --- | --- |
| Content-Type と Content-Length を署名した PUT（`X-Amz-SignedHeaders=content-length;content-type;host`） | 署名どおりなら 200 |
| 署名より大きい / 小さいサイズ | **403 SignatureDoesNotMatch** |
| 署名と違う Content-Type | 403 SignatureDoesNotMatch |
| Content-Length を署名しない PUT | 10MB でも 200（上限なし） |
| 有効期限内の同じ URL の再利用 | 200（同じキーに上書きされる） |
| 期限切れの URL | 403 ExpiredRequest |
| 署名付き GET / 署名なし GET | 200 / 400 |
| ブラウザ (Chrome) から PUT、CORS 未設定 | `TypeError: Failed to fetch` |
| ブラウザから PUT、CORS 設定後 | 200。ブラウザが自動で付ける Content-Length は署名と一致する |
| ブラウザから署名より大きいサイズを PUT | 失敗。エラー応答に CORS ヘッダーが付かないので、アプリからは 403 ではなく `TypeError` に見える |
| ブラウザから署名付き GET | 200 |

ドキュメント上、署名付き POST（`content-length-range` 条件付きのポリシー）は非対応で、Content-Length の署名については記載がない。
実測では、Content-Length を署名ヘッダーに含めれば R2 は検証する。

## 採用する流れ

1. ブラウザが撮影した画像を圧縮・EXIF 削除し、バイト数と形式を Workers に送る（HMAC の部屋トークン付き）
2. Workers がトークン・上限サイズ・形式・回数を検査し、推測困難なキーで **Content-Type と Content-Length を含めて**署名した PUT URL（有効期限 5 分程度）を返す
3. ブラウザがその URL に PUT する。サイズが違えば R2 が拒否する
4. 同じ URL は期限内なら再利用できるので、キーは提出ごとに新しく発行する。上書きされても困らない設計にする（例: キーに提出 ID を含める）

`aws4fetch` は既定で content-type / content-length を署名対象から外すので、`allHeaders: true` を指定する必要がある。

## バケットの CORS

```json
[{ "allowed": { "origins": ["https://<アプリのオリジン>"], "methods": ["PUT", "GET"], "headers": ["content-type"] }, "maxAgeSeconds": 600 }]
```

## 実行方法

```bash
export R2_ACCOUNT_ID=... R2_BUCKET=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=...
node presign.ts                 # Node から署名付き PUT/GET
node browser.ts before-cors     # CORS 設定前
cf r2 buckets cors update <bucket> --rules @cors.json --force
node browser.ts after-cors      # CORS 設定後
```

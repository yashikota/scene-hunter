// void.config.ts の observability を Worker の script-settings に反映する。
// Void 1.1.11 は版ごとにアップロードするだけで、版に属さないこの設定を送らないので、デプロイのあとに実行する。
// 使い方: CLOUDFLARE_API_TOKEN と CLOUDFLARE_ACCOUNT_ID をシェルに渡して node scripts/apply-script-settings.mjs
const { default: config } = await import("../void.config.ts");

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !accountId) {
  console.error("CLOUDFLARE_API_TOKEN と CLOUDFLARE_ACCOUNT_ID が必要です");
  process.exit(1);
}

const { name, observability } = config.cloudflare;
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${name}/script-settings`,
  {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ observability }),
  },
);
const body = await res.json();
if (!body.success) {
  console.error(`script-settings の更新に失敗しました: HTTP ${res.status}`, body.errors);
  process.exit(1);
}
console.log("observability:", JSON.stringify(body.result.observability));

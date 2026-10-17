#!/usr/bin/env bash
# 写真用の R2 バケットに CORS と Lifecycle を設定する。秘密情報は使わない。
# 使い方: CLOUDFLARE_ACCOUNT_ID=... scripts/r2-setup.sh
# cf CLI にログインしていること（cf auth login）。
set -euo pipefail

BUCKET="${R2_BUCKET:-scene-hunter-storage}"
PROD_ORIGIN="${PROD_ORIGIN:-https://scene-hunter.scene-hunter.workers.dev}"
DEV_ORIGIN="http://localhost:5173"

# ブラウザは署名付き URL に PUT（content-type: image/jpeg）で上げ、GET で読む。
CORS_RULES=$(cat <<JSON
[
  {
    "allowed": {
      "origins": ["$PROD_ORIGIN", "$DEV_ORIGIN"],
      "methods": ["PUT", "GET"],
      "headers": ["content-type"]
    },
    "maxAgeSeconds": 3600
  }
]
JSON
)

# 部屋の写真（rooms/ 以下）は 1 日で消す。
LIFECYCLE_RULES=$(cat <<'JSON'
[
  {
    "id": "expire-room-photos",
    "enabled": true,
    "conditions": { "prefix": "rooms/" },
    "deleteObjectsTransition": { "condition": { "type": "Age", "maxAge": 86400 } }
  }
]
JSON
)

cf r2 buckets cors update "$BUCKET" --rules "$CORS_RULES" --force
cf r2 buckets lifecycle update "$BUCKET" --rules "$LIFECYCLE_RULES" --force
cf r2 buckets cors get "$BUCKET"
cf r2 buckets lifecycle get "$BUCKET"

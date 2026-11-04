#!/usr/bin/env bash
# 既存の手動起動用入口。OS 選択と SHA-256 検証は Node スクリプトにまとめる。
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/e2e-relay.mjs

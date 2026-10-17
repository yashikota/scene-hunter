#!/usr/bin/env bash
# e2e テスト用に、手元で moq-relay を動かす（Playwright の webServer から起動する）。
# 初回だけ GitHub Releases から落とし、下に固定した SHA-256 と照らしてから .cache/moq-relay/ に置く。
# 使い方: scripts/e2e-relay.sh   （tests/e2e/relay.toml の設定で [::]:4443 を listen する）
set -euo pipefail

VERSION="0.17.6"
TARGET="x86_64-unknown-linux-gnu"
# moq-relay-v0.17.6 の SHA256SUMS から写した値。実行時に SHA256SUMS は信じない。
SHA256="9153e17022ac50d1b7cdb301973348277072a5fe7ccb0c284677d654f9b5c44e"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.cache/moq-relay"
NAME="moq-relay-v${VERSION}-${TARGET}"
BIN="$CACHE/$NAME/bin/moq-relay"

if [[ "$(uname -s)-$(uname -m)" != "Linux-x86_64" ]]; then
  echo "e2e-relay: Linux x86_64 だけに対応している（$(uname -s)-$(uname -m)）" >&2
  exit 1
fi

if [[ ! -x "$BIN" ]]; then
  mkdir -p "$CACHE"
  TARBALL="$CACHE/$NAME.tar.gz"
  curl -fsSL --retry 3 -o "$TARBALL.part" \
    "https://github.com/moq-dev/moq/releases/download/moq-relay-v${VERSION}/$NAME.tar.gz"
  echo "$SHA256  $TARBALL.part" | sha256sum -c --quiet -
  mv "$TARBALL.part" "$TARBALL"
  tar -xzf "$TARBALL" -C "$CACHE"
fi

exec "$BIN" "$ROOT/tests/e2e/relay.toml"

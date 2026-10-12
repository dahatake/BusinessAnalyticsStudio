#!/bin/sh
# FR-141: Business Analytics Studio 起動スクリプト（Mac・Linux）。127.0.0.1 だけで待ち受ける。
# 依存パッケージが未導入なら npm install、dist がなければ npm run build を行い、npm start で起動する。
cd "$(dirname "$0")" || exit 1

if ! command -v npm >/dev/null 2>&1; then
  echo "[start] npm が見つかりません。Node.js を導入してください。" >&2
  exit 1
fi

step() {
  label="$1"; shift
  echo "[start] $label"
  if ! npm "$@"; then
    echo "[start] 失敗: $label。上の npm の出力で原因を確認してください。起動しません。" >&2
    exit 1
  fi
}

[ -d node_modules ] || step "npm install（依存パッケージが未導入）" install
[ -d dist ] || step "npm run build（dist がありません）" run build

echo "[start] npm start で起動します（URL は次に表示されます。終了は Ctrl+C）"
exec npm start

#!/usr/bin/env bash
# Business Analytics Studio のセットアップ（macOS / シェル。Linux でも動きます）。何も入っていない PC で、お手本パックが起動するところまで進めます。(FR-107, FR-108)
#
# Node.js LTS・Git・GitHub Copilot CLI・依存パッケージ（Copilot SDK を含む）の有無を確認して不足分だけを導入し、
# アプリのビルド、.env の雛形の作成、中継プロセスの疎通と Copilot のサインインの確認、お手本パックでの起動確認（verify）まで行います。
#  - 繰り返し実行しても安全です（導入済みのものには何もしません。既存の .env は変更しません）。
#  - 管理者権限（sudo）は使いません。Homebrew とユーザー領域だけに導入します。
#  - 実行前に、行う内容の一覧を表示します。--dry-run を付けると、一覧と現在の状態を表示するだけで、何も変更しません。
#  - 失敗したら、原因と対処方法を表示して、0 以外の終了コードで止まります。結果は logs/setup.log に残します。
#  - 顧客情報・認証情報はスクリプトに含めず、外部へ送信しません（通信するのは、不足分の導入のためのパッケージの取得だけです）。
#
# 使い方: bash scripts/setup.sh [--dry-run]

DRY_RUN=0
for a in "$@"; do
  case "$a" in
    --dry-run|-n) DRY_RUN=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "使い方: bash scripts/setup.sh [--dry-run]"; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
NODE_MIN=22
case "${EDB_SETUP_NODE_MIN:-}" in ''|*[!0-9]*) ;; *) NODE_MIN="$EDB_SETUP_NODE_MIN" ;; esac
LOG_FILE="$ROOT/logs/setup.log"
HELPER="$ROOT/scripts/setup/helper.mjs"
STEP_COUNT=10
FAIL_CAUSE=""
FAIL_REMEDY=""
NET_REMEDY='ネットワーク（プロキシを含む）を確認してから、もう一度実行してください。繰り返し実行しても安全です。'

write_log() {
  [ "$DRY_RUN" = 1 ] && return 0
  mkdir -p "$ROOT/logs"
  printf '%s %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$1" >> "$LOG_FILE"
}
say() { printf '%s\n' "$1"; write_log "$1"; }
fail() { FAIL_CAUSE="$1"; FAIL_REMEDY="$2"; return 1; }

# 外部コマンドを実行し、出力を画面とログに流して、終了コードを返す
run_ext() {
  write_log "\$ $*"
  "$@" 2>&1 | while IFS= read -r line; do printf '    %s\n' "$line"; write_log "    $line"; done
  return "${PIPESTATUS[0]}"
}
has_cmd() { command -v "$1" >/dev/null 2>&1; }
test_quiet() { has_cmd "$1" && "$@" >/dev/null 2>&1; }
helper_ok() { has_cmd node && [ -f "$HELPER" ] && node "$HELPER" "$1" >/dev/null 2>&1; }

node_ok() {
  has_cmd node || return 1
  local major
  major="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+)\..*/\1/')"
  case "$major" in ''|*[!0-9]*) return 1 ;; esac
  [ "$major" -ge "$NODE_MIN" ]
}

install_with_brew() { # $1=表示名 $2...=brew の引数
  local what="$1"; shift
  if ! has_cmd brew; then
    fail "$what を自動で導入できません（Homebrew が見つかりません）。" "$what を手動でインストールしてから、もう一度このスクリプトを実行してください（Node.js: https://nodejs.org/、Git: https://git-scm.com/、Homebrew: https://brew.sh/）。"
    return 1
  fi
  run_ext brew "$@"
  local code=$?
  if [ "$code" -ne 0 ]; then
    fail "$what の導入（brew $*）が終了コード $code で失敗しました。" "ネットワークと Homebrew の状態（brew doctor）を確認するか、$what を手動でインストールしてから、もう一度実行してください。"
    return 1
  fi
}
run_npm() { # $1=説明 $2=対処 $3...=npm の引数
  local what="$1" remedy="$2"; shift 2
  run_ext npm "$@"
  local code=$?
  if [ "$code" -ne 0 ]; then
    fail "$what（npm $*）が終了コード $code で失敗しました。" "$remedy"
    return 1
  fi
}

# ---- 段階 -----------------------------------------------------------------
name_of() {
  case "$1" in
    1) echo "Node.js LTS（v$NODE_MIN 以上）" ;;
    2) echo "Git" ;;
    3) echo "GitHub Copilot CLI" ;;
    4) echo "依存パッケージ（npm）" ;;
    5) echo "Copilot SDK（@github/copilot-sdk）" ;;
    6) echo "verify 用のブラウザー（Playwright Chromium）" ;;
    7) echo "アプリのビルド（dist）" ;;
    8) echo ".env（既存なら内容を保持）" ;;
    9) echo "中継プロセスの疎通と Copilot のサインインの確認" ;;
    10) echo "お手本パックでの起動確認（verify）" ;;
  esac
}
# 対象外なら理由を表示して 0 を返す
na_of() {
  case "$1" in
    6) [ -f "$ROOT/tests/system/package.json" ] || { echo "tests/system がないため、verify のブラウザー検査は行えません"; return 0; } ;;
  esac
  return 1
}
# 導入済みなら 0。常に実行する段階（9・10）は 1
check_of() {
  case "$1" in
    1) node_ok ;;
    2) test_quiet git --version ;;
    3) test_quiet copilot --version ;;
    4) helper_ok deps ;;
    5) helper_ok sdk ;;
    6) helper_ok chromium ;;
    7) helper_ok dist-fresh ;;
    8) [ -f "$ROOT/.env" ] ;;
    *) return 1 ;;
  esac
}
checkable() { case "$1" in 9|10) return 1 ;; *) return 0 ;; esac; }

apply_of() {
  case "$1" in
    1)
      install_with_brew 'Node.js LTS' install "node@$NODE_MIN" || return 1
      run_ext brew link --overwrite --force "node@$NODE_MIN" >/dev/null
      hash -r
      node_ok || { fail 'Node.js を導入しましたが、このシェルから見つかりません。' '新しいターミナルを開いて、もう一度このスクリプトを実行してください。'; return 1; } ;;
    2)
      install_with_brew 'Git' install git || return 1
      hash -r
      test_quiet git --version || { fail 'Git を導入しましたが、このシェルから見つかりません。' '新しいターミナルを開いて、もう一度このスクリプトを実行してください。'; return 1; } ;;
    3)
      run_npm 'GitHub Copilot CLI の導入' "$NET_REMEDY（npm のグローバルの導入先に書き込めない場合は、npm config set prefix ~/.npm-global を設定し、その bin を PATH に加えます。sudo は使いません）" install -g @github/copilot || return 1
      hash -r
      test_quiet copilot --version || { fail 'GitHub Copilot CLI を導入しましたが、見つかりません。' '新しいターミナルを開いて、もう一度このスクリプトを実行してください（npm のグローバルの導入先が PATH にあるか確認してください）。'; return 1; } ;;
    4) run_npm '依存パッケージの導入' "$NET_REMEDY" install --no-audit --no-fund || return 1 ;;
    5) run_npm 'Copilot SDK の導入' "$NET_REMEDY" install --no-save --no-audit --no-fund @github/copilot-sdk || return 1 ;;
    6)
      if [ ! -d "$ROOT/tests/system/node_modules/@playwright/test" ]; then
        run_npm 'System Test 用パッケージの導入' "$NET_REMEDY" install --prefix tests/system --no-audit --no-fund || return 1
      fi
      run_ext node "$HELPER" install-chromium
      local code=$?
      [ "$code" -eq 0 ] || { fail "Chromium の導入が終了コード $code で失敗しました。" "$NET_REMEDY"; return 1; } ;;
    7) run_npm 'アプリのビルド' 'エラーの内容（上の出力と logs/setup.log）を確認して、直してからもう一度実行してください。' run build || return 1 ;;
    8)
      [ -f "$ROOT/.env.example" ] || { fail '.env の雛形（.env.example）が見つかりません。' 'リポジトリを取得し直すか、.env.example を復元してください。'; return 1; }
      cp "$ROOT/.env.example" "$ROOT/.env" || { fail '.env を作成できませんでした。' 'フォルダーの書き込み権限を確認してください。'; return 1; }
      say '    .env を .env.example から作成しました（値は必要になったときだけ自分で入れてください。コミットしないでください）' ;;
    9)
      local out code line
      out="$(node "$HELPER" relay 2>&1)"; code=$?
      while IFS= read -r line; do [ -n "$line" ] && { printf '    %s\n' "$line"; write_log "    $line"; }; done <<EOF
$out
EOF
      [ "$code" -eq 0 ] || { fail '中継プロセスの疎通を確認できませんでした。' '上の原因と対処を確認してください（.env の EDB_RELAY_PORT のポートが使用中のときは変更します）。'; return 1; }
      if printf '%s\n' "$out" | grep -q '^copilot=signed-out'; then
        say '    注意: GitHub Copilot にサインインしていません（今はモックで動きます）。実際の生成 AI を使うには、`copilot` を起動して `/login` でサインインしてください。'
      else
        say '    GitHub Copilot: サインイン済み'
      fi ;;
    10)
      local pout pcode work
      pout="$(node "$HELPER" prepare-verify 2>&1)"; pcode=$?
      [ "$pcode" -eq 0 ] || { fail "$(printf '%s' "$pout" | tr '\n' ' ')" 'ビルド（npm run build）と examples/mono の有無を確認してください。'; return 1; }
      work="$(printf '%s\n' "$pout" | tail -n 1)"
      run_ext npm run verify:pack -- "$work"
      local vcode=$?
      [ "$vcode" -eq 0 ] || { fail "お手本パックの verify が不合格です（終了コード $vcode）。" '上の「原因」「対処」を確認してください（Chromium がない場合は、もう一度このスクリプトを実行します）。'; return 1; } ;;
  esac
}

# ---- 実行 -----------------------------------------------------------------
if [ "$DRY_RUN" = 1 ]; then say '=== セットアップ （表示だけ: 何も変更しません） ==='; else say '=== セットアップ  ==='; fi
say '行う内容（この PC の中だけ。管理者権限は不要。顧客情報・認証情報は扱わず、外部へは送信しません）:'
n=1
while [ "$n" -le "$STEP_COUNT" ]; do say "  $n. $(name_of "$n")"; n=$((n + 1)); done
say '  各項目は、導入済みなら何もしません。不足分だけを導入します。'

n=1
while [ "$n" -le "$STEP_COUNT" ]; do
  nm="$(name_of "$n")"
  if reason="$(na_of "$n")"; then
    say "[$n/$STEP_COUNT] $nm: 対象外（$reason）"
  elif checkable "$n" && check_of "$n"; then
    say "[$n/$STEP_COUNT] $nm: 導入済み"
  elif [ "$DRY_RUN" = 1 ]; then
    if checkable "$n"; then say "[$n/$STEP_COUNT] $nm: 未導入（実行すると導入します）"; else say "[$n/$STEP_COUNT] $nm: 実行時に確認します"; fi
  else
    say "[$n/$STEP_COUNT] $nm: 実行します"
    if ! apply_of "$n"; then
      say "失敗: [$n/$STEP_COUNT] $nm"
      say "  原因: $FAIL_CAUSE"
      say "  対処: $FAIL_REMEDY"
      say '  ログ: logs/setup.log'
      exit 1
    fi
    say "[$n/$STEP_COUNT] $nm: 完了"
  fi
  n=$((n + 1))
done

if [ "$DRY_RUN" = 1 ]; then say '表示だけで終わりました（何も変更していません）。実行するには --dry-run を外してください。'; exit 0; fi
say 'セットアップが成功しました。起動: npm start（表示された URL を Edge か Chrome で開きます）。'
exit 0

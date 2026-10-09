<#
.SYNOPSIS
  企業向け議論ボードのセットアップ（Windows / PowerShell）。何も入っていない PC で、お手本パックが起動するところまで進めます。(FR-107, FR-108)
.DESCRIPTION
  Node.js LTS・Git・GitHub Copilot CLI・依存パッケージ（Copilot SDK を含む）の有無を確認して不足分だけを導入し、
  アプリのビルド、.env の雛形の作成、中継プロセスの疎通と Copilot のサインインの確認、お手本パックでの起動確認（verify）まで行います。
  - 繰り返し実行しても安全です（導入済みのものには何もしません。既存の .env は変更しません）。
  - 管理者権限は不要です（ユーザー領域に導入します）。
  - 実行前に、行う内容の一覧を表示します。-DryRun を付けると、一覧と現在の状態を表示するだけで、何も変更しません。
  - 失敗したら、原因と対処方法を表示して、0 以外の終了コードで止まります。結果は logs/setup.log に残します。
  - 顧客情報・認証情報はスクリプトに含めず、外部へ送信しません（通信するのは、不足分の導入のためのパッケージの取得だけです）。
.PARAMETER DryRun
  行う内容の一覧と現在の状態を表示するだけで、何も変更しません。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#>
param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
$NodeMin = 22
if ($env:EDB_SETUP_NODE_MIN -match '^\d+$') { $NodeMin = [int]$env:EDB_SETUP_NODE_MIN }
$LogFile = Join-Path $Root 'logs\setup.log'
$Helper = Join-Path $Root 'scripts\setup\helper.mjs'
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-Log([string]$Text) {
  if ($DryRun) { return }
  $dir = Split-Path -Parent $LogFile
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::AppendAllText($LogFile, ('{0} {1}{2}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'), $Text, [Environment]::NewLine), $Utf8)
}
function Say([string]$Text) { Write-Host $Text; Write-Log $Text }

class SetupError : System.Exception {
  [string]$Cause
  [string]$Remedy
  SetupError([string]$cause, [string]$remedy) : base($cause) { $this.Cause = $cause; $this.Remedy = $remedy }
}
function Fail([string]$Cause, [string]$Remedy) { throw [SetupError]::new($Cause, $Remedy) }

# 外部コマンドを実行し、出力を画面とログに流して、終了コードを返す
function Invoke-External([string]$Exe, [string[]]$Arguments) {
  Write-Log ('$ {0} {1}' -f $Exe, ($Arguments -join ' '))
  & $Exe @Arguments 2>&1 | ForEach-Object { $line = "$_"; Write-Host "    $line"; Write-Log "    $line" }
  return $LASTEXITCODE
}
function Has-Command([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }
function Test-Quiet([string]$Exe, [string[]]$Arguments) {
  if (-not (Has-Command $Exe)) { return $false }
  & $Exe @Arguments *> $null
  return ($LASTEXITCODE -eq 0)
}
# winget が PATH を更新した後の反映（今のウィンドウの PATH に、新しく増えた分だけを足す）
function Update-PathFromRegistry {
  $have = @($env:Path -split ';' | Where-Object { $_ })
  foreach ($scope in 'Machine', 'User') {
    foreach ($e in ([Environment]::GetEnvironmentVariable('Path', $scope) -split ';' | Where-Object { $_ })) {
      if ($have -notcontains $e) { $env:Path = "$env:Path;$e"; $have += $e }
    }
  }
}
function Install-WithWinget([string]$Id, [string]$What) {
  if (-not (Has-Command 'winget')) {
    Fail "$What を自動で導入できません（winget が見つかりません）。" "$What を手動でインストールしてから、もう一度このスクリプトを実行してください（Node.js: https://nodejs.org/、Git: https://git-scm.com/）。"
  }
  $code = Invoke-External 'winget' @('install', '--id', $Id, '-e', '--scope', 'user', '--silent', '--accept-package-agreements', '--accept-source-agreements')
  if ($code -ne 0) {
    Fail "$What の導入（winget install $Id）が終了コード $code で失敗しました。" "ネットワークとプロキシの設定を確認するか、$What を手動でインストールしてから、もう一度実行してください。"
  }
  Update-PathFromRegistry
}
function Invoke-Npm([string[]]$Arguments, [string]$What, [string]$Remedy) {
  $code = Invoke-External 'npm' $Arguments
  if ($code -ne 0) { Fail "$What（npm $($Arguments -join ' ')）が終了コード $code で失敗しました。" $Remedy }
}

function Test-Node {
  if (-not (Has-Command 'node')) { return $false }
  $v = "$(& node -v 2>$null)"
  return ($v -match '^v(\d+)\.' -and [int]$Matches[1] -ge $NodeMin)
}
function Test-Helper([string]$Command) {
  if (-not (Has-Command 'node') -or -not (Test-Path -LiteralPath $Helper)) { return $false }
  & node $Helper $Command *> $null
  return ($LASTEXITCODE -eq 0)
}

$NetRemedy = 'ネットワーク（プロキシを含む）を確認してから、もう一度実行してください。繰り返し実行しても安全です。'

# 段階: Name（表示名）、Check（導入済みなら $true）、Apply（導入・実行。失敗したら Fail）、NA（対象外なら理由の文字列）
$Steps = @(
  @{ Name = "Node.js LTS（v$NodeMin 以上）"; Check = { Test-Node }
     Apply = { Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js LTS'
               if (-not (Test-Node)) { Fail 'Node.js を導入しましたが、この PowerShell から見つかりません。' '新しい PowerShell を開いて、もう一度このスクリプトを実行してください。' } } },
  @{ Name = 'Git'; Check = { Test-Quiet 'git' @('--version') }
     Apply = { Install-WithWinget 'Git.Git' 'Git'
               if (-not (Test-Quiet 'git' @('--version'))) { Fail 'Git を導入しましたが、この PowerShell から見つかりません。' '新しい PowerShell を開いて、もう一度このスクリプトを実行してください。' } } },
  @{ Name = 'GitHub Copilot CLI'; Check = { Test-Quiet 'copilot' @('--version') }
     Apply = { Invoke-Npm @('install', '-g', '@github/copilot') 'GitHub Copilot CLI の導入' $NetRemedy
               if (-not (Test-Quiet 'copilot' @('--version'))) { Fail 'GitHub Copilot CLI を導入しましたが、見つかりません。' '新しい PowerShell を開いて、もう一度このスクリプトを実行してください（npm のグローバルの導入先が PATH にあるか確認してください）。' } } },
  @{ Name = '依存パッケージ（npm）'; Check = { Test-Helper 'deps' }
     Apply = { Invoke-Npm @('install', '--no-audit', '--no-fund') '依存パッケージの導入' $NetRemedy } },
  @{ Name = 'Copilot SDK（@github/copilot-sdk）'; Check = { Test-Helper 'sdk' }
     Apply = { Invoke-Npm @('install', '--no-save', '--no-audit', '--no-fund', '@github/copilot-sdk') 'Copilot SDK の導入' $NetRemedy } },
  @{ Name = 'verify 用のブラウザー（Playwright Chromium）'
     NA = { if (Test-Path -LiteralPath (Join-Path $Root 'tests\system\package.json')) { $null } else { 'tests\system がないため、verify のブラウザー検査は行えません' } }
     Check = { Test-Helper 'chromium' }
     Apply = {
       if (-not (Test-Path -LiteralPath (Join-Path $Root 'tests\system\node_modules\@playwright\test'))) {
         Invoke-Npm @('install', '--prefix', 'tests/system', '--no-audit', '--no-fund') 'System Test 用パッケージの導入' $NetRemedy
       }
       $code = Invoke-External 'node' @($Helper, 'install-chromium')
       if ($code -ne 0) { Fail "Chromium の導入が終了コード $code で失敗しました。" $NetRemedy }
     } },
  @{ Name = 'アプリのビルド（dist）'; Check = { Test-Helper 'dist-fresh' }
     Apply = { Invoke-Npm @('run', 'build') 'アプリのビルド' 'エラーの内容（上の出力と logs\setup.log）を確認して、直してからもう一度実行してください。' } },
  @{ Name = '.env（既存なら内容を保持）'; Check = { Test-Path -LiteralPath (Join-Path $Root '.env') }
     Apply = {
       $example = Join-Path $Root '.env.example'
       if (-not (Test-Path -LiteralPath $example)) { Fail '.env の雛形（.env.example）が見つかりません。' 'リポジトリを取得し直すか、.env.example を復元してください。' }
       Copy-Item -LiteralPath $example -Destination (Join-Path $Root '.env')
       Say '    .env を .env.example から作成しました（値は必要になったときだけ自分で入れてください。コミットしないでください）'
     } },
  @{ Name = '中継プロセスの疎通と Copilot のサインインの確認'; Check = $null
     Apply = {
       $out = @(& node $Helper 'relay' 2>&1 | ForEach-Object { "$_" })
       $code = $LASTEXITCODE
       foreach ($l in $out) { Write-Host "    $l"; Write-Log "    $l" }
       if ($code -ne 0) { Fail '中継プロセスの疎通を確認できませんでした。' '上の原因と対処を確認してください（.env の EDB_RELAY_PORT のポートが使用中のときは変更します）。' }
       if ($out -contains 'copilot=signed-out') {
         Say '    注意: GitHub Copilot にサインインしていません（今はモックで動きます）。実際の生成 AI を使うには、`copilot` を起動して `/login` でサインインしてください。'
       } else { Say '    GitHub Copilot: サインイン済み' }
     } },
  @{ Name = 'お手本パックでの起動確認（verify）'; Check = $null
     Apply = {
       $out = @(& node $Helper 'prepare-verify' 2>&1 | ForEach-Object { "$_" })
       if ($LASTEXITCODE -ne 0) { Fail ($out -join ' ') 'ビルド（npm run build）と examples\mono の有無を確認してください。' }
       $work = $out[-1]
       $code = Invoke-External 'npm' @('run', 'verify:pack', '--', $work)
       if ($code -ne 0) { Fail "お手本パックの verify が不合格です（終了コード $code）。" '上の「原因」「対処」を確認してください（Chromium がない場合は、もう一度このスクリプトを実行します）。' }
     } }
)

Say "=== セットアップ $(if ($DryRun) { '（表示だけ: 何も変更しません）' }) ==="
Say '行う内容（この PC の中だけ。管理者権限は不要。顧客情報・認証情報は扱わず、外部へは送信しません）:'
$i = 0
foreach ($s in $Steps) { $i++; Say ('  {0}. {1}' -f $i, $s.Name) }
Say '  各項目は、導入済みなら何もしません。不足分だけを導入します。'

try {
  $i = 0
  foreach ($s in $Steps) {
    $i++
    $na = if ($s.NA) { & $s.NA } else { $null }
    if ($na) { Say ('[{0}/{1}] {2}: 対象外（{3}）' -f $i, $Steps.Count, $s.Name, $na); continue }
    $done = if ($s.Check) { [bool](& $s.Check) } else { $false }
    if ($done) { Say ('[{0}/{1}] {2}: 導入済み' -f $i, $Steps.Count, $s.Name); continue }
    if ($DryRun) {
      $what = if ($s.Check) { '未導入（実行すると導入します）' } else { '実行時に確認します' }
      Say ('[{0}/{1}] {2}: {3}' -f $i, $Steps.Count, $s.Name, $what)
      continue
    }
    Say ('[{0}/{1}] {2}: 実行します' -f $i, $Steps.Count, $s.Name)
    try {
      & $s.Apply
    } catch [SetupError] {
      throw
    } catch {
      Fail $_.Exception.Message '上の出力を確認して、もう一度実行してください。'
    }
    Say ('[{0}/{1}] {2}: 完了' -f $i, $Steps.Count, $s.Name)
  }
} catch [SetupError] {
  $e = $_.Exception
  Say ('失敗: [{0}/{1}] {2}' -f $i, $Steps.Count, $Steps[$i - 1].Name)
  Say ('  原因: {0}' -f $e.Cause)
  Say ('  対処: {0}' -f $e.Remedy)
  if (-not $DryRun) { Say '  ログ: logs\setup.log' }
  exit 1
}

if ($DryRun) { Say '表示だけで終わりました（何も変更していません）。実行するには -DryRun を外してください。'; exit 0 }
Say 'セットアップが成功しました。起動: npm start（表示された URL を Edge か Chrome で開きます）。'
exit 0

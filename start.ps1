# FR-141: Business Analytics Studio 起動スクリプト（Windows）。127.0.0.1 だけで待ち受ける。
# 依存パッケージが未導入なら npm install、dist がなければ npm run build を行い、npm start で起動する。
$ErrorActionPreference = 'Stop'
# Windows のコンソールでも URL に色コードが混ざらないようにする（vite は NO_COLOR を尊重する）。
$env:NO_COLOR = '1'
Set-Location -LiteralPath $PSScriptRoot

function Invoke-Step([string]$Label, [string[]]$NpmArgs) {
    Write-Host "[start] $Label"
    & npm @NpmArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[start] 失敗: $Label（終了コード $LASTEXITCODE）。上の npm の出力で原因を確認してください。起動しません。" -ForegroundColor Red
        exit 1
    }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host '[start] npm が見つかりません。Node.js を導入してください（scripts/ のセットアップスクリプトを参照）。' -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath 'node_modules' -PathType Container)) {
    Invoke-Step 'npm install（依存パッケージが未導入）' @('install')
}
if (-not (Test-Path -LiteralPath 'dist' -PathType Container)) {
    Invoke-Step 'npm run build（dist がありません）' @('run', 'build')
}

Write-Host '[start] npm start で起動します（URL は次に表示されます。終了は Ctrl+C）'
& npm start
exit $LASTEXITCODE

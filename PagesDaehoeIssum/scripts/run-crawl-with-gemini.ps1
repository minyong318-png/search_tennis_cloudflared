param(
  [int]$TennisTownDetailLimit = 20,
  [int]$ImageLimit = 2
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$agyPath = Join-Path $env:LOCALAPPDATA "agy\bin\agy.exe"

Write-Host "[daehoe] checking Antigravity CLI..."
if (-not (Test-Path $agyPath)) {
  Write-Host "[daehoe] Antigravity CLI is not installed."
  Write-Host "[daehoe] Install it with:"
  Write-Host "        irm https://antigravity.google/cli/install.ps1 | iex"
  exit 2
}
$env:ANTIGRAVITY_CLI_COMMAND = $agyPath

$env:DAEHOE_AI_EXTRACT = "1"
$env:DAEHOE_AI_EXTRACT_PROVIDER = "antigravity-cli"
$env:DAEHOE_AI_ACTIVE_ONLY = "1"
$env:DAEHOE_TENNISTOWN_DETAIL_LIMIT = [string]$TennisTownDetailLimit
$env:DAEHOE_AI_IMAGE_LIMIT = [string]$ImageLimit

Write-Host "[daehoe] crawling with Antigravity/Gemini extraction for active tournaments only..."
node (Join-Path $root "scripts\crawl-all.mjs")

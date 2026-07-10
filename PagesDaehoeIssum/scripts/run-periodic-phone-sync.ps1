param(
  [string]$ProjectRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
  [string]$Serial = "ce071717859b74870d",
  [string]$AdbPath = "D:\Python_Save\search_tennis_cloudflared\.tools\android-platform-tools\platform-tools\adb.exe",
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot

if (-not (Test-Path $AdbPath)) { throw "ADB not found: $AdbPath" }
$device = & $AdbPath -s $Serial get-state 2>$null
if ($device -ne "device") { throw "TennisTown phone is not connected: $Serial" }

$now = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, "Korea Standard Time")
$next = $now.AddMonths(1)
$months = "$($now.Month),$($next.Month)"
$monthKeys = "$($now.ToString('yyyy-MM')),$($next.ToString('yyyy-MM'))"

$env:DAEHOE_MERGE_EXISTING = "1"
$env:DAEHOE_AI_EXTRACT = "0"
$env:DAEHOE_SOURCE_TYPES = "TENNISTOWN_APP"
$env:DAEHOE_TENNISTOWN_ADB = "1"
$env:DAEHOE_TENNISTOWN_ADB_SERIAL = $Serial
$env:DAEHOE_TENNISTOWN_ADB_PATH = $AdbPath
$env:DAEHOE_TENNISTOWN_ADB_YEAR = [string]$now.Year
$env:DAEHOE_TENNISTOWN_APP_MONTHS = $months
$env:DAEHOE_TENNISTOWN_ADB_RESUME = "0"
$env:DAEHOE_TENNISTOWN_ADB_RESET_CHECKPOINT = "0"
Remove-Item Env:DAEHOE_REQUIRE_SUPABASE -ErrorAction SilentlyContinue

node PagesDaehoeIssum\scripts\crawl-all.mjs
node --test tests\daehoe-tournament-sync.test.js
python -m unittest tests/test_daehoe_supabase_sync.py

Copy-Item PagesDaehoeIssum\data\tournaments.json PagesCourtIssum\daehoe\data\tournaments.json -Force
Copy-Item PagesDaehoeIssum\data\crawl-meta.json PagesCourtIssum\daehoe\data\crawl-meta.json -Force
Copy-Item PagesDaehoeIssum\data\tennistown-app-checkpoint.json PagesCourtIssum\daehoe\data\tennistown-app-checkpoint.json -Force

git add -- PagesDaehoeIssum/data PagesCourtIssum/daehoe/data
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "Update TennisTown tournament data"
  git push origin HEAD:main
}

gh workflow run daehoe_supabase_sync.yml -R minyong318-png/Search_Tennis_Fly -f mode=incremental -f months=$monthKeys

if (-not $SkipDeploy) {
  npx wrangler pages deploy PagesDaehoeIssum --project-name daehoe-isseum --branch main
  npx wrangler pages deploy PagesCourtIssum --project-name courtissum --branch main
}

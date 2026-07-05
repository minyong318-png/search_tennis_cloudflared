param(
  [string]$Serial = "ce071717859b74870d",
  [string]$Months = "7,8,9,10,11,12",
  [switch]$DetailsOnly,
  [switch]$SkipAi = $true
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$env:DAEHOE_TENNISTOWN_ADB = "1"
$env:DAEHOE_TENNISTOWN_ADB_SERIAL = $Serial
$env:DAEHOE_TENNISTOWN_ADB_PATH = ".tools\android-platform-tools\platform-tools\adb.exe"
$env:DAEHOE_TENNISTOWN_APP_MONTHS = $Months
$env:DAEHOE_TENNISTOWN_DETAIL_SKIP_AI = $(if ($SkipAi) { "1" } else { "0" })

& $env:DAEHOE_TENNISTOWN_ADB_PATH -s $Serial shell echo ok

if ($DetailsOnly) {
  node PagesDaehoeIssum\scripts\analyze-tennistown-app-details.mjs
} else {
  node PagesDaehoeIssum\scripts\crawl-all.mjs
  node PagesDaehoeIssum\scripts\analyze-tennistown-app-details.mjs
}

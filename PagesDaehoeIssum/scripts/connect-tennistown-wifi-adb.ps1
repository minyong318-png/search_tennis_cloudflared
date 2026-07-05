param(
  [string]$AdbPath = ".tools\android-platform-tools\platform-tools\adb.exe",
  [string]$PhoneIp = "",
  [int]$Port = 5555
)

$ErrorActionPreference = "Stop"

function Run-Adb {
  param([string[]]$AdbArgs)
  & $AdbPath @AdbArgs
}

if (!(Test-Path $AdbPath)) {
  throw "adb not found: $AdbPath"
}

$devices = Run-Adb @("devices", "-l")
Write-Host $devices

if (!$PhoneIp) {
  $wlan = Run-Adb @("shell", "ip", "-f", "inet", "addr", "show", "wlan0")
  $match = [regex]::Match(($wlan -join "`n"), "inet\s+([0-9.]+)/")
  if (!$match.Success) {
    throw "Could not read phone wlan0 IP. Keep USB connected and Wi-Fi enabled on the phone."
  }
  $PhoneIp = $match.Groups[1].Value
}

Write-Host "Phone Wi-Fi IP: $PhoneIp"

Run-Adb @("tcpip", "$Port")
Start-Sleep -Seconds 2

$target = "${PhoneIp}:$Port"
Write-Host "Connecting $target ..."
Run-Adb @("connect", $target)

$after = Run-Adb @("devices", "-l")
Write-Host $after

if (($after -join "`n") -notmatch [regex]::Escape($target)) {
  Write-Warning "Wireless ADB was not established. PC and phone must be reachable on the same LAN. If PC is only on Ethernet/public network and phone is on a private Wi-Fi network, connect the PC to the same Wi-Fi or phone hotspot first."
  exit 2
}

Write-Host "Wireless ADB ready. Use:"
Write-Host "`$env:DAEHOE_TENNISTOWN_ADB_SERIAL='$target'"

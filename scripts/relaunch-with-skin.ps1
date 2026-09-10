<#
  relaunch-with-skin.ps1

  One command to get the skin back after a WorkBuddy restart:
    stop WorkBuddy -> relaunch it with the CDP port open -> inject the theme.

  WorkBuddy's skin is memory-only (persistenceEnabled: false, no persistence
  support on this product), so this has to run once per WorkBuddy session.

  SECURITY: this opens WorkBuddy's remote debugging port for the lifetime of
  that WorkBuddy process. Any process running as you can then drive its
  renderer. Close it by restarting WorkBuddy normally (without this script).

  Usage:
    .\relaunch-with-skin.ps1
    .\relaunch-with-skin.ps1 -Theme saint-pegasus
#>
param(
  [string]$Theme   = "miku-488137",
  [int]$Port       = 9342,
  [string]$Root    = "$PSScriptRoot\..\heige-codex-skin-studio-main",
  [string]$Exe     = "",
  [string]$NodeExe = ""
)

$ErrorActionPreference = 'Stop'

# --- locate node 22 (bundled runtime, then portable install, then PATH) ---
if (-not $NodeExe) {
  $bundled = Join-Path $PSScriptRoot '..\runtime\node.exe'
  if (Test-Path $bundled) { $NodeExe = (Resolve-Path $bundled).Path }
}
if (-not $NodeExe) {
  $portable = Join-Path $env:LOCALAPPDATA 'node22'
  if (Test-Path $portable) {
    $NodeExe = (Get-ChildItem $portable -Recurse -Filter node.exe -ErrorAction SilentlyContinue |
                Select-Object -First 1).FullName
  }
}
if (-not $NodeExe) { $NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source }
if (-not $NodeExe) { throw "Node.js not found. Install 22+ or pass -NodeExe." }
$ver = (& $NodeExe --version) -replace '^v',''
if ([int]($ver -split '\.')[0] -lt 22) { throw "Node $ver found, need >= 22." }

# --- install bundled themes into the user theme store on first run ---
$bundledThemes = Join-Path $PSScriptRoot '..\themes'
if (Test-Path $bundledThemes) {
  $store = Join-Path $env:APPDATA 'HeiGeCodexSkinStudio\themes'
  New-Item -ItemType Directory -Force -Path $store | Out-Null
  foreach ($dir in Get-ChildItem $bundledThemes -Directory) {
    $dest = Join-Path $store $dir.Name
    if (-not (Test-Path (Join-Path $dest 'theme.json'))) {
      Copy-Item $dir.FullName -Destination $store -Recurse -Force
      Write-Host "installed theme: $($dir.Name)"
    }
  }
}

# --- locate WorkBuddy.exe ---
if (-not $Exe) {
  $running = Get-Process WorkBuddy -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1
  if ($running) { $Exe = $running.Path }
}
if (-not $Exe) {
  foreach ($c in @("$env:LOCALAPPDATA\Programs\WorkBuddy\WorkBuddy.exe",
                   "C:\Program Files\WorkBuddy\WorkBuddy.exe",
                   "E:\Program Files\WorkBuddy\WorkBuddy.exe")) {
    if (Test-Path $c) { $Exe = $c; break }
  }
}
if (-not $Exe) { throw "WorkBuddy.exe not found. Pass -Exe <path>." }
Write-Host "WorkBuddy : $Exe"
Write-Host "node      : $NodeExe (v$ver)"
Write-Host "theme     : $Theme"

# --- stop, relaunch with the debug port, wait for CDP ---
Stop-Process -Name WorkBuddy -Force -ErrorAction SilentlyContinue
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Process WorkBuddy -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
}

$env:WORKBUDDY_REMOTE_DEBUGGING_PORT = "$Port"
Start-Process -FilePath $Exe
Write-Host "relaunched with WORKBUDDY_REMOTE_DEBUGGING_PORT=$Port"

$up = $false
$deadline = (Get-Date).AddSeconds(90)
while (-not $up -and (Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $up = $true }
  } catch { }
}
if (-not $up) { throw "CDP port $Port did not open within 90s." }
Write-Host "CDP up."

# --- inject ---
# $Theme is only a fallback unless the caller explicitly asked for it.
$injectArgs = @((Join-Path $PSScriptRoot 'wb-inject.mjs'), $Root, $Theme, '--port', "$Port")
if (-not $PSBoundParameters.ContainsKey('Theme')) { $injectArgs += '--prefer-stored' }
& $NodeExe @injectArgs

# --- keep uploaded photos ---
# The upload slot holds one image; a second upload overwrites the first. Archive
# whatever is in there now, then leave a small watcher running so anything the
# user uploads during this session is saved the moment it appears. The watcher
# polls a short fingerprint (not the image) and exits on its own once WorkBuddy
# closes, so nothing is left behind.
$archiveDir = Join-Path $PSScriptRoot '..\themes'
if (Test-Path $archiveDir) {
  $archiver = Join-Path $PSScriptRoot 'wb-archive-theme.mjs'
  & $NodeExe $archiver $archiveDir --port $Port

  # drop any watcher left over from a previous run
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*wb-archive-theme*--watch*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  Start-Process -FilePath $NodeExe `
    -ArgumentList @($archiver, $archiveDir, '--port', "$Port", '--watch') `
    -WindowStyle Hidden
  Write-Host "watching for uploads (auto-saves new pictures)"
}

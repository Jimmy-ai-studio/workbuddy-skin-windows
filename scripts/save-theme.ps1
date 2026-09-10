<#
  save-theme.ps1

  Archive the picture currently sitting in WorkBuddy's "我的主题" slot to disk,
  without restarting anything.

  Why this exists: the upload slot (localStorage `heigeCodexCustomTheme`) holds
  exactly one image. Archiving normally runs as part of relaunch-with-skin.ps1,
  so if you upload two pictures inside one WorkBuddy session, the first is gone
  before the archiver ever sees it. Run this right after uploading to keep it.

  Requires WorkBuddy to be running with the skin applied (CDP port open).
#>
param(
  [int]$Port       = 9342,
  [string]$ThemesDir = "",
  [string]$NodeExe = $env:HEIGE_NODE
)

$ErrorActionPreference = 'Stop'

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
if (-not $NodeExe) { throw "Node.js not found." }

if (-not $ThemesDir) {
  foreach ($c in @((Join-Path $PSScriptRoot '..\mythemes'), (Join-Path $PSScriptRoot '..\themes'))) {
    if (Test-Path $c) { $ThemesDir = (Resolve-Path $c).Path; break }
  }
}
if (-not $ThemesDir) { throw "themes directory not found." }

& $NodeExe (Join-Path $PSScriptRoot 'wb-archive-theme.mjs') $ThemesDir --port $Port

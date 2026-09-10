<#
  workbuddy-restore.ps1
  Removes the injected skin and returns WorkBuddy to its native appearance.
#>
param(
  [string]$Root    = $env:HEIGE_SKIN_ROOT,
  [int]$Port       = 9342,
  [string]$NodeExe = $env:HEIGE_NODE
)

$ErrorActionPreference = 'Stop'

if (-not $Root) { throw "Pass -Root <repo path>, or set HEIGE_SKIN_ROOT." }
$cli = Join-Path $Root 'src\cli.mjs'
if (-not (Test-Path $cli)) { throw "cli.mjs not found at: $cli" }

if (-not $NodeExe) { $NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source }
if (-not $NodeExe) { throw "node not found. Install Node.js 22+, or set -NodeExe." }

$env:HEIGE_SKIN_PRODUCT = 'workbuddy'
& $NodeExe $cli restore --app workbuddy --port $Port

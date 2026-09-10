<#
  workbuddy-apply.ps1
  Windows shell for heige-codex-skin-studio's WorkBuddy support.
  The upstream repo ships only macOS .command wrappers for WorkBuddy;
  the engine (src/cli.mjs + src/skin-css-workbuddy.mjs) is cross-platform Node.
  This script is the missing Windows wrapper.

  Usage:
    .\workbuddy-apply.ps1 -Root "C:\path\to\heige-codex-skin-studio"
    .\workbuddy-apply.ps1 -Root "..." -Theme ink-jade -Restart
#>
param(
  [string]$Root    = $env:HEIGE_SKIN_ROOT,
  [string]$Theme   = "",
  [int]$Port       = 9342,
  [switch]$Restart,
  [string]$NodeExe = $env:HEIGE_NODE
)

$ErrorActionPreference = 'Stop'

if (-not $Root) { throw "Pass -Root <repo path>, or set HEIGE_SKIN_ROOT." }
$cli = Join-Path $Root 'src\cli.mjs'
if (-not (Test-Path $cli)) { throw "cli.mjs not found at: $cli" }

# --- Node >= 22 check (upstream assertNodeVersion enforces this) ---
if (-not $NodeExe) { $NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source }
if (-not $NodeExe) { throw "node not found. Install Node.js 22+, or set -NodeExe." }
$ver = (& $NodeExe --version) -replace '^v',''
$major = [int]($ver -split '\.')[0]
if ($major -lt 22) {
  throw "Node $ver found, but this project requires >= 22. Install Node 22+ and retry (see docs/USAGE.md)."
}

# --- Product selection, mirrors scripts/workbuddy-apply.command ---
$env:HEIGE_SKIN_PRODUCT = 'workbuddy'
# WorkBuddy opens its CDP port via env var (Codex uses a CLI flag).
# Session-scoped only: this deliberately does NOT persist to the user profile.
$env:WORKBUDDY_REMOTE_DEBUGGING_PORT = "$Port"

$cliArgs = @('apply','--app','workbuddy','--port',"$Port")
if ($Restart) { $cliArgs += '--restart' }
if ($Theme)   { $cliArgs += @('--theme',$Theme) } else { $cliArgs += '--prefer-stored' }

Write-Host "node $cli $($cliArgs -join ' ')"
& $NodeExe $cli @cliArgs

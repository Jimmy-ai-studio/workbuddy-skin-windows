@echo off
chcp 65001 >nul
title WorkBuddy 换肤

echo.
echo   ============================================
echo     WorkBuddy 换肤 - 双击即可
echo   ============================================
echo.
echo   注意：这会关闭并重新打开 WorkBuddy。
echo   请先保存正在进行的任务，然后按任意键继续。
echo.
pause >nul

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\relaunch-with-skin.ps1"

if errorlevel 1 (
  echo.
  echo   [失败] 上面是错误信息，把这段截图贴到 GitHub Issue。
) else (
  echo.
  echo   [完成] 去看 WorkBuddy 窗口吧。
  echo.
  echo   提示：关掉 WorkBuddy 再正常打开，皮肤就恢复原样了。
)
echo.
pause

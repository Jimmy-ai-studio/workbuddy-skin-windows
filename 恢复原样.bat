@echo off
chcp 65001 >nul
title WorkBuddy 恢复原样

echo.
echo   正在关闭 WorkBuddy 并恢复原生界面...
echo.
taskkill /IM WorkBuddy.exe /F >nul 2>&1
timeout /t 3 >nul
start "" "%LOCALAPPDATA%\Programs\WorkBuddy\WorkBuddy.exe" 2>nul
if errorlevel 1 start "" "C:\Program Files\WorkBuddy\WorkBuddy.exe" 2>nul
if errorlevel 1 start "" "E:\Program Files\WorkBuddy\WorkBuddy.exe" 2>nul
echo   已恢复。WorkBuddy 正在重新打开。
echo.
pause

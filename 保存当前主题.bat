@echo off
chcp 936 >nul
title 保存当前主题

echo.
echo   ============================================
echo     把刚上传的图片保存下来
echo   ============================================
echo.
echo   传完图片后双击这个，就不会被下一张顶掉。
echo   （WorkBuddy 需要保持开着）
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\save-theme.ps1"

echo.
pause

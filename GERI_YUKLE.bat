@echo off
chcp 65001 >nul
title Lojistik - Yedekten Geri Yukleme
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0geri_yukle.ps1"
echo.
pause

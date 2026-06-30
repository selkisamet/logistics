@echo off
chcp 65001 >nul
title Lojistik - Yedekleme
cd /d "%~dp0"
echo Yedek aliniyor...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0yedekle.ps1"
echo.
pause

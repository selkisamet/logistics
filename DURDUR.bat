@echo off
chcp 65001 >nul
title Lojistik - Durduruluyor
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"

echo Veritabani (PostgreSQL) durduruluyor...
call pnpm pg:stop
echo.
echo Tamamlandi.
pause

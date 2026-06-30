@echo off
chcp 65001 >nul
title Lojistik - Tesellum ve Depo
cd /d "%~dp0"

rem Node ve pnpm yollarini ekle
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"

echo ============================================
echo   Lojistik Tesellum ve Depo - Baslatiliyor
echo ============================================
echo.
echo [1/2] Veritabani (PostgreSQL) baslatiliyor...
".tools\pgsql\bin\pg_ctl.exe" -D ".tools\pgdata" -l ".tools\pg.log" -o "-p 5432" start >nul 2>&1

rem PostgreSQL gercekten cevap verene kadar bekle (en fazla ~25 saniye)
set /a tries=0
:waitpg
".tools\pgsql\bin\pg_isready.exe" -p 5432 >nul 2>&1
if %errorlevel%==0 goto pgok
set /a tries+=1
if %tries% GEQ 25 (
  echo.
  echo HATA: PostgreSQL baslatilamadi.
  echo Ayrinti icin: .tools\pg.log dosyasina bakin.
  echo.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto waitpg
:pgok
echo       Veritabani hazir.
echo.
echo [2/2] Uygulama baslatiliyor...
echo.
echo   Tarayicidan su adresi acin:  http://localhost:5173
echo   Giris: admin@lojistik.local  /  admin123
echo.
echo   KAPATMAK icin bu pencereyi kapatin.
echo ============================================
echo.
call pnpm dev
pause

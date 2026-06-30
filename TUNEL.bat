@echo off
chcp 65001 >nul
title Lojistik - Telefon Tuneli (HTTPS)
cd /d "%~dp0"

echo ============================================
echo   Telefon Tuneli (HTTPS) - cloudflared
echo ============================================
echo.
echo   ONEMLI: Once BASLAT.bat acik olmali (uygulama calisiyor olmali).
echo.
echo   Birazdan asagida "https://....trycloudflare.com" gibi bir adres cikacak.
echo   O adresi TELEFONUN tarayicisina yazip acin.
echo   Giris: admin@lojistik.local / admin123
echo.
echo   Kapatmak icin bu pencereyi kapatin.
echo ============================================
echo.

set /a tries=0
:retry
set /a tries+=1
echo [Deneme %tries%] Tunel baslatiliyor...
echo.
".tools\cloudflared.exe" tunnel --no-autoupdate --url http://localhost:5173
echo.
if %tries% LSS 5 (
  echo Tunel kapandi/baslatilamadi. 3 saniye sonra yeniden denenecek... ^(durdurmak icin bu pencereyi kapatin^)
  timeout /t 3 /nobreak >nul
  goto retry
)
echo.
echo Birkac deneme basarisiz oldu. Internet baglantinizi kontrol edip tekrar calistirin.
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo(
echo   ============================================================
echo    VERI SIFIRLAMA
echo    Silinecek : On ihbar, Mal kabul, Sevkiyat (palet/tutanak/log)
echo    Korunacak : Musteri, Depo, Arac, Kullanici
echo   ============================================================
echo(
set /p ONAY=Devam icin buyuk harfle  EVET  yazip Enter'a basin:
if /I not "%ONAY%"=="EVET" (
  echo Iptal edildi.
  echo(
  pause
  exit /b 0
)
echo(
node "apps\api\scripts\reset-operational.mjs" --yes
echo(
pause

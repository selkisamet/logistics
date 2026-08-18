@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo(
echo   ============================================================
echo    MEVCUT KAYITLARI BUYUK HARFE CEVIR
echo    Ornek     : "arkem kimya"  ^-^>  "ARKEM KIMYA"
echo    Dokunulmaz: e-posta, sifre, telefon, vergi no, tarih, sayilar
echo    ONCE YEDEKLE.bat ile yedek alin!
echo   ============================================================
echo(
echo   Once DENEME yapiliyor (hicbir kayit degismez)...
echo(
node "apps\api\scripts\uppercase-text.mjs" --yes --dry-run
echo(
set /p ONAY=Yukaridaki degisiklikleri UYGULAMAK icin buyuk harfle  EVET  yazin:
if /I not "%ONAY%"=="EVET" (
  echo Iptal edildi.
  echo(
  pause
  exit /b 0
)
echo(
node "apps\api\scripts\uppercase-text.mjs" --yes
echo(
pause

# Lojistik - Yedekten geri yukleme (DIKKAT: mevcut veriyi degistirir)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pgbin = Join-Path $root '.tools\pgsql\bin'
$pgdata = Join-Path $root '.tools\pgdata'
$backups = Join-Path $root 'backups'

$dumps = Get-ChildItem $backups -Filter 'lojistik_*.dump' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
if (-not $dumps) { Write-Host 'Hic yedek bulunamadi.'; exit 1 }

Write-Host 'Mevcut yedekler (yeni -> eski):'
for ($i = 0; $i -lt $dumps.Count; $i++) {
  Write-Host ("  [{0}] {1}   {2}" -f $i, $dumps[$i].Name, $dumps[$i].LastWriteTime)
}
$sel = Read-Host 'Geri yuklenecek yedek numarasi (Enter = en yeni [0])'
if ([string]::IsNullOrWhiteSpace($sel)) { $sel = 0 }
$dump = $dumps[[int]$sel]

Write-Host ''
Write-Host "DIKKAT: Mevcut veritabani '$($dump.Name)' yedegi ile DEGISTIRILECEK." -ForegroundColor Yellow
Write-Host 'Once uygulamayi kapatin (DURDUR degil, sadece BASLAT penceresini kapatin).' -ForegroundColor Yellow
$c = Read-Host 'Onaylamak icin buyuk harfle EVET yazin'
if ($c -ne 'EVET') { Write-Host 'Iptal edildi.'; exit 0 }

& "$pgbin\pg_isready.exe" -p 5432 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  & "$pgbin\pg_ctl.exe" -D $pgdata -l (Join-Path $root '.tools\pg.log') -o "-p 5432" start | Out-Null
  Start-Sleep -Seconds 4
}

& "$pgbin\pg_restore.exe" -U postgres -p 5432 -d lojistik --clean --if-exists $dump.FullName
Write-Host 'Geri yukleme tamamlandi.'

# Lojistik - Otomatik veritabani + fotograf yedegi
# Calistirma: YEDEKLE.bat (elle) ya da gunluk zamanlanmis gorev.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pgbin = Join-Path $root '.tools\pgsql\bin'
$pgdata = Join-Path $root '.tools\pgdata'
$backups = Join-Path $root 'backups'
New-Item -ItemType Directory -Force $backups | Out-Null

# 1) PostgreSQL calismiyorsa baslat (yedek her durumda alinabilsin)
& "$pgbin\pg_isready.exe" -p 5432 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  & "$pgbin\pg_ctl.exe" -D $pgdata -l (Join-Path $root '.tools\pg.log') -o "-p 5432" start | Out-Null
  Start-Sleep -Seconds 4
}

$ts = Get-Date -Format 'yyyyMMdd_HHmmss'

# 2) Veritabani yedegi (sikistirilmis, geri yuklenebilir custom format)
$dump = Join-Path $backups "lojistik_$ts.dump"
& "$pgbin\pg_dump.exe" -U postgres -p 5432 -Fc -f $dump lojistik
Write-Host "Veritabani yedegi: $dump ($([math]::Round((Get-Item $dump).Length/1KB)) KB)"

# 3) Yuklenen fotograflar (varsa)
$uploads = Join-Path $root 'apps\api\uploads'
if ((Test-Path $uploads) -and (Get-ChildItem $uploads -File -Recurse -ErrorAction SilentlyContinue)) {
  $zip = Join-Path $backups "uploads_$ts.zip"
  Compress-Archive -Path (Join-Path $uploads '*') -DestinationPath $zip -Force
  Write-Host "Fotograf yedegi: $zip"
}

# 4) 30 gunden eski yedekleri temizle
Get-ChildItem $backups -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force

Write-Host "Yedekleme tamamlandi. Klasor: $backups"

#!/bin/bash
# Gecelik yedek: veritabanı dökümü + irsaliye fotoğrafları. 14 günden eskiyi siler.
# Cron'a ekle:  0 2 * * * /opt/lojistik/yedek.sh >> /var/log/lojistik-yedek.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"

DIR="$(pwd)/backups"
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$DIR"

echo "[$(date '+%F %T')] yedek basliyor"

# Veritabanı — custom format (pg_restore ile seçmeli geri yükleme yapılabilir)
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U lojistik -d lojistik --format=custom > "$DIR/db-$STAMP.dump"

# Yüklenen fotoğraflar — volume'u salt-okunur bağlayıp arşivle
docker run --rm \
  -v lojistik_uploads:/kaynak:ro \
  -v "$DIR":/hedef \
  alpine tar czf "/hedef/uploads-$STAMP.tar.gz" -C /kaynak .

find "$DIR" -name 'db-*.dump'        -mtime +14 -delete
find "$DIR" -name 'uploads-*.tar.gz' -mtime +14 -delete

echo "[$(date '+%F %T')] yedek tamam:"
ls -lh "$DIR" | tail -4
echo
echo "UYARI: bu yedekler AYNI sunucuda. Sunucu tamamen giderse onlar da gider."
echo "Ayda bir dosyaları kendi bilgisayarına indir (scp) ya da sağlayıcının snapshot'ını aç."

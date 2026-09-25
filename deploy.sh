#!/bin/bash
# Yeni sürümü yayına al. Sunucuda:  ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Son kod çekiliyor"
git pull --ff-only

echo "==> İmaj derleniyor ve servisler güncelleniyor"
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Eski imajlar temizleniyor (disk dolmasın)"
docker image prune -f

echo "==> Durum"
docker compose -f docker-compose.prod.yml ps

echo
echo "Kayıtları izlemek için:  docker compose -f docker-compose.prod.yml logs -f app"

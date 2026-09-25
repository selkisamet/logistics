#!/bin/sh
# Her açılışta: şema güncel mi + giriş hesapları var mı → sonra uygulamayı başlat.
set -e

cd /app/apps/api

echo "==> Veritabanı şeması uygulanıyor (prisma migrate deploy)"
pnpm exec prisma migrate deploy

# seed.ts upsert'lerinde `update: {}` var → VAR OLAN kullanıcıya DOKUNMAZ.
# Yani değiştirdiğin admin şifresi her yeniden başlatmada sıfırlanmaz.
echo "==> Giriş hesapları kontrol ediliyor (seed)"
pnpm exec tsx prisma/seed.ts

echo "==> Uygulama başlıyor"
exec "$@"

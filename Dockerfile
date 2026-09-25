# Tesellüm & Depo — üretim imajı.
# Tek süreç: NestJS API hem /api'yi hem derlenmiş web'i (SPA) sunar → tek origin, CORS yok.

# ---------- 1) Derleme ----------
FROM node:20-bookworm-slim AS builder

# Prisma motoru libssl ister.
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# Önce yalnızca manifest'ler: bağımlılıklar değişmedikçe bu katman cache'ten gelir.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Kaynak (.dockerignore node_modules'ü dışarıda tutar → üstteki kurulum ezilmez)
COPY . .

# Sıra ÖNEMLİ:
#  1) shared çift derlenir (CJS→Nest, ESM→Vite); web ve api ona bağlı.
#  2) prisma generate, api derlemesinden ÖNCE gelmeli — api'nin TS'i üretilmiş
#     Prisma tiplerini (Prisma.PrismaClientKnownRequestError vb.) kullanıyor.
#     pnpm 9 postinstall script'lerini ÇALIŞTIRMADIĞI için client kendiliğinden
#     oluşmaz; sonraya bırakılırsa nest build 113 tip hatasıyla çöker.
# VITE_API_URL verilmez → web aynı-köken relative /api kullanır.
RUN pnpm --filter @lojistik/shared build \
 && pnpm --filter @lojistik/api exec prisma generate \
 && pnpm --filter @lojistik/web build \
 && pnpm --filter @lojistik/api build

# ---------- 2) Çalıştırma ----------
FROM node:20-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TZ=Europe/Istanbul
RUN corepack enable

WORKDIR /app
# node_modules dahil kopyalanır: prisma CLI (migrate deploy) ve tsx (seed) çalışma
# anında gerekiyor. İmaj büyür ama kurulum tek parça kalır.
COPY --from=builder /app ./
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/apps/api
# main.ts: WEB_DIST varsayılanı = cwd/../web/dist = /app/apps/web/dist ✓
#          STORAGE_LOCAL_DIR=./uploads = /app/apps/api/uploads (volume buraya biner)
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]

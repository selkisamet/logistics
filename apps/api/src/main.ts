import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';
  app.enableCors({ origin: webOrigin.split(','), credentials: true });

  app.setGlobalPrefix('api');
  // Doğrulama, @lojistik/shared zod şemalarıyla controller seviyesinde yapılır (ZodValidationPipe).

  // Yüklenen dosyaları statik servis et (local storage)
  const uploadsDir = config.get<string>('STORAGE_LOCAL_DIR') ?? './uploads';
  const absUploads = join(process.cwd(), uploadsDir);
  if (!existsSync(absUploads)) mkdirSync(absUploads, { recursive: true });
  app.useStaticAssets(absUploads, { prefix: '/uploads/' });

  // Prod: derlenmiş web'i (SPA) aynı adresten sun → tek origin, CORS yok.
  // WEB_DIST verilmezse apps/web/dist varsayılır (api, apps/api'den çalışır).
  const webDist = config.get<string>('WEB_DIST') ?? join(process.cwd(), '..', 'web', 'dist');
  if (existsSync(webDist)) {
    app.useStaticAssets(webDist);
    const indexHtml = join(webDist, 'index.html');
    // /api ve /uploads dışındaki GET'lerde SPA index.html döndür (client-side routing).
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return next();
      }
      res.sendFile(indexHtml);
    });
    Logger.log(`Web (SPA) servis ediliyor: ${webDist}`, 'Bootstrap');
  }

  const port = Number(config.get('API_PORT') ?? process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API hazır: :${port}/api`, 'Bootstrap');
}

void bootstrap();

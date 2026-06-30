import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
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

  const port = Number(config.get('API_PORT') ?? 3000);
  await app.listen(port);
  Logger.log(`API hazır: http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();

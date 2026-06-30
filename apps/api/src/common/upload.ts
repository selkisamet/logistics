import { diskStorage, memoryStorage } from 'multer';
import { extname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomCode } from './codes';

const UPLOAD_DIR = join(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? './uploads');

/** Yüklenen dosyaların erişim yolu (main.ts /uploads/ altında statik servis eder). */
export function attachmentUrl(filename: string): string {
  return `/uploads/${filename}`;
}

export const imageUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      cb(null, `${randomCode(12)}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
};

/** OCR için: dosyayı diske yazmadan bellekte tutar (geçici, file.buffer erişilir). */
export const imageMemoryUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
};

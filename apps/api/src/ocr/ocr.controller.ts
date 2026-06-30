import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageMemoryUploadOptions } from '../common/upload';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OcrService } from './ocr.service';

@UseGuards(JwtAuthGuard)
@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  /** Etiket fotoğrafı → yapısal veri (ürün, adet, müşteri, referans). */
  @Post('label')
  @UseInterceptors(FileInterceptor('file', imageMemoryUploadOptions))
  extractLabel(@UploadedFile() file?: Express.Multer.File) {
    return this.ocrService.extractLabel(file);
  }
}

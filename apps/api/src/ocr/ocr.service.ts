import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { LabelExtraction, WaybillExtraction } from '@lojistik/shared';
import { OCR_PROVIDER, type OcrProvider } from './ocr-provider.interface';

@Injectable()
export class OcrService {
  constructor(@Inject(OCR_PROVIDER) private readonly provider: OcrProvider) {}

  extractLabel(file?: Express.Multer.File): Promise<LabelExtraction> {
    if (!file) throw new BadRequestException('Görsel bulunamadı');
    return this.provider.extractLabel(file.buffer, file.mimetype);
  }

  extractWaybill(file?: Express.Multer.File): Promise<WaybillExtraction> {
    if (!file) throw new BadRequestException('Görsel bulunamadı');
    return this.provider.extractWaybill(file.buffer, file.mimetype);
  }
}

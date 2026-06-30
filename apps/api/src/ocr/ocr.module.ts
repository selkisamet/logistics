import { Logger, Module, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OCR_PROVIDER, type OcrProvider } from './ocr-provider.interface';
import { ClaudeOcrProvider } from './claude-ocr.provider';
import { OcrService } from './ocr.service';
import { OcrController } from './ocr.controller';

/** API anahtarı yoksa kullanılan, net hata veren sağlayıcı. */
class NotConfiguredOcrProvider implements OcrProvider {
  extractLabel(): never {
    throw new ServiceUnavailableException(
      'AI etiket okuma yapılandırılmamış. apps/api/.env içine ANTHROPIC_API_KEY ekleyin.',
    );
  }
}

@Module({
  providers: [
    OcrService,
    {
      provide: OCR_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): OcrProvider => {
        const driver = config.get<string>('OCR_PROVIDER') ?? 'claude';
        const apiKey = config.get<string>('ANTHROPIC_API_KEY');
        if (driver === 'claude' && apiKey) {
          return new ClaudeOcrProvider(apiKey);
        }
        Logger.warn(
          'ANTHROPIC_API_KEY yok — AI etiket OCR devre dışı (yapılandırılınca otomatik aktif).',
          'OcrModule',
        );
        return new NotConfiguredOcrProvider();
      },
    },
  ],
  controllers: [OcrController],
})
export class OcrModule {}

import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { labelExtractionSchema, type LabelExtraction } from '@lojistik/shared';
import type { OcrProvider } from './ocr-provider.interface';

// Anthropic structured outputs için JSON Schema (additionalProperties:false zorunlu).
const LABEL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reference: { type: ['string', 'null'] },
    customerName: { type: ['string', 'null'] },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sku: { type: ['string', 'null'] },
          description: { type: 'string' },
          qty: { type: ['integer', 'null'] },
          barcode: { type: ['string', 'null'] },
        },
        required: ['sku', 'description', 'qty', 'barcode'],
      },
    },
  },
  required: ['reference', 'customerName', 'lines'],
} as const;

const SYSTEM_PROMPT = `Sen bir lojistik mal kabul asistanısın. Sana verilen kargo/ürün etiketi fotoğrafından
yapısal veri çıkar. Etikette görünen ürün(ler)i, adetleri, varsa SKU/ürün kodunu ve barkod numarasını oku.
Etikette gönderici/müşteri adı ve bir referans/irsaliye numarası varsa onları da çıkar.
Sadece etikette GÖRDÜĞÜN bilgiyi yaz; tahmin etme, uydurma. Görünmeyen alanı null bırak.
Açıklamayı (description) Türkçe ve kısa tut.`;

export class ClaudeOcrProvider implements OcrProvider {
  private readonly logger = new Logger(ClaudeOcrProvider.name);
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async extractLabel(image: Buffer, mimeType: string): Promise<LabelExtraction> {
    const mediaType = this.normalizeMediaType(mimeType);

    // output_config newer SDK sürümlerinde tiplenmiştir; tip bağımlılığını gevşek tutuyoruz.
    const params = {
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      output_config: { format: { type: 'json_schema', schema: LABEL_JSON_SCHEMA }, effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: image.toString('base64') },
            },
            {
              type: 'text',
              text: 'Bu etiketteki bilgileri şemaya göre çıkar.',
            },
          ],
        },
      ],
    };

    const response = await this.client.messages.create(params as never);

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.logger.warn(`OCR yanıtı JSON olarak ayrıştırılamadı: ${text.slice(0, 200)}`);
      return { reference: null, customerName: null, lines: [] };
    }

    const result = labelExtractionSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn('OCR çıktısı şemaya uymadı');
      return { reference: null, customerName: null, lines: [] };
    }
    return result.data;
  }

  private normalizeMediaType(mimeType: string): string {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    return allowed.includes(mimeType) ? mimeType : 'image/jpeg';
  }
}

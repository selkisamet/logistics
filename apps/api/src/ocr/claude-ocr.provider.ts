import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  labelExtractionSchema,
  waybillExtractionSchema,
  type LabelExtraction,
  type WaybillExtraction,
} from '@lojistik/shared';
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

const WAYBILL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    waybillNo: { type: ['string', 'null'] },
    orderNo: { type: ['string', 'null'] },
  },
  required: ['waybillNo', 'orderNo'],
} as const;

const WAYBILL_SYSTEM_PROMPT = `Sen bir lojistik mal kabul asistanısın. Sana verilen e-İrsaliye / sevk irsaliyesi
fotoğrafından YALNIZCA iki değeri oku: İrsaliye Numarası (waybillNo) ve varsa Sipariş Numarası (orderNo).
Türkçe belgelerde bunlar "İrsaliye No", "İrsaliye Numarası", "Sevk İrsaliyesi No", "Sipariş No",
"Sipariş Numarası" etiketlerinin YANINDA yer alır. İrsaliye No genelde harf+rakam karışık kısa bir koddur
(ör. ATZ2026000006278). Belgede "ETTN" adıyla uzun bir UUID (ör. 8487FAD0-0A57-45D8-...) bulunabilir;
bu İrsaliye No DEĞİLDİR, onu KULLANMA. Sadece belgede AÇIKÇA GÖRDÜĞÜN değeri yaz; tahmin etme, uydurma.
Etiketi değil yalnızca değeri döndür. Bulamadığın alanı null bırak.`;

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

  async extractWaybill(image: Buffer, mimeType: string): Promise<WaybillExtraction> {
    const mediaType = this.normalizeMediaType(mimeType);

    const params = {
      model: 'claude-opus-4-8',
      max_tokens: 256,
      output_config: { format: { type: 'json_schema', schema: WAYBILL_JSON_SCHEMA }, effort: 'low' },
      system: WAYBILL_SYSTEM_PROMPT,
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
              text: 'Bu belgedeki irsaliye ve sipariş numarasını şemaya göre çıkar.',
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
      this.logger.warn(`İrsaliye OCR yanıtı JSON değil: ${text.slice(0, 120)}`);
      return { waybillNo: null, orderNo: null };
    }
    const result = waybillExtractionSchema.safeParse(parsed);
    return result.success ? result.data : { waybillNo: null, orderNo: null };
  }

  private normalizeMediaType(mimeType: string): string {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    return allowed.includes(mimeType) ? mimeType : 'image/jpeg';
  }
}

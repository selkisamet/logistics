import { z } from 'zod';

/** AI etiket OCR — bir kargo/ürün etiketinden çıkarılan yapısal veri. */
export const labelLineSchema = z.object({
  sku: z.string().nullable().optional(),
  description: z.string(),
  qty: z.number().int().nullable().optional(),
  barcode: z.string().nullable().optional(),
});
export type LabelLine = z.infer<typeof labelLineSchema>;

export const labelExtractionSchema = z.object({
  reference: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  lines: z.array(labelLineSchema),
});
export type LabelExtraction = z.infer<typeof labelExtractionSchema>;

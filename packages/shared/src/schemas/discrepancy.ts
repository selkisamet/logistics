import { z } from 'zod';
import { DISCREPANCY_TYPES, DiscrepancyType } from '../enums';

export const DISCREPANCY_TYPE_LABELS: Record<DiscrepancyType, string> = {
  SHORTAGE: 'Eksik',
  OVERAGE: 'Fazla',
  DAMAGE: 'Hasar',
  WRONG_ITEM: 'Yanlış ürün',
  OTHER: 'Diğer',
};

export const createDiscrepancySchema = z.object({
  receiptId: z.string().min(1),
  receiptLineId: z.string().optional(),
  type: z.enum(DISCREPANCY_TYPES as [DiscrepancyType, ...DiscrepancyType[]]),
  qty: z.coerce.number().int().min(0).optional(),
  description: z.string().min(1, 'Açıklama gerekli'),
  // Yüklenmiş ek (foto) id'leri
  attachmentIds: z.array(z.string()).optional(),
});
export type CreateDiscrepancyInput = z.infer<typeof createDiscrepancySchema>;

export const attachmentSchema = z.object({
  id: z.string(),
  url: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  createdAt: z.string(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const discrepancySchema = z.object({
  id: z.string(),
  receiptId: z.string(),
  receiptLineId: z.string().nullable(),
  type: z.enum(DISCREPANCY_TYPES as [DiscrepancyType, ...DiscrepancyType[]]),
  qty: z.number().int().nullable(),
  description: z.string(),
  attachments: z.array(attachmentSchema),
  createdById: z.string().nullable(),
  createdAt: z.string(),
});
export type Discrepancy = z.infer<typeof discrepancySchema>;

import { z } from 'zod';
import { upperStr, upperOpt, codeOpt } from '../text';

export const createWarehouseSchema = z.object({
  name: upperStr(z.string().min(2, 'Depo adı gerekli')),
  // Boş bırakılırsa sunucu addan otomatik üretir (MERKEZ_DEPO gibi).
  code: codeOpt(
    z
      .string()
      .min(2, 'Kod en az 2 karakter olmalı')
      .regex(/^[A-Za-z0-9_-]+$/, 'Kod sadece harf, rakam, - ve _ içerebilir'),
  ),
  address: upperOpt(),
});
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

export const updateWarehouseSchema = createWarehouseSchema.partial();
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;

export const warehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  address: z.string().nullable(),
  isDefault: z.boolean().optional().default(false),
  createdAt: z.string(),
});
export type Warehouse = z.infer<typeof warehouseSchema>;

/** Depo içi lokasyon (raf/koridor/göz) — MVP'de temel düzeyde */
export const createLocationSchema = z.object({
  warehouseId: z.string().min(1),
  code: upperStr(z.string().min(1, 'Lokasyon kodu gerekli')),
  description: upperOpt(),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const locationSchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  code: z.string(),
  description: z.string().nullable(),
});
export type Location = z.infer<typeof locationSchema>;

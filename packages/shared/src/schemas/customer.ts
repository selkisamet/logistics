import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(2, 'Müşteri adı gerekli'),
  // Boş bırakılırsa sunucu otomatik atar (MST0001...). İstenirse elle de verilebilir.
  code: z
    .string()
    .min(2, 'Kod en az 2 karakter olmalı')
    .regex(/^[A-Za-z0-9_-]+$/, 'Kod sadece harf, rakam, - ve _ içerebilir')
    .optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Geçerli bir e-posta girin').optional().or(z.literal('')),
  address: z.string().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string(),
});
export type Customer = z.infer<typeof customerSchema>;

/** Müşteriye ait kaynak depo/adres (malın alınacağı yer - pickup) */
export const createCustomerLocationSchema = z.object({
  name: z.string().min(2, 'Depo/lokasyon adı gerekli'),
  address: z.string().optional(),
  phone: z.string().optional(),
});
export type CreateCustomerLocationInput = z.infer<typeof createCustomerLocationSchema>;

export const customerLocationSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type CustomerLocation = z.infer<typeof customerLocationSchema>;

/** Müşteriye ait alıcı (firmanın kendi müşterisi - malın gideceği taraf) */
export const createCustomerRecipientSchema = z.object({
  name: z.string().min(2, 'Alıcı adı gerekli'),
  address: z.string().optional(),
  phone: z.string().optional(),
});
export type CreateCustomerRecipientInput = z.infer<typeof createCustomerRecipientSchema>;

export const customerRecipientSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type CustomerRecipient = z.infer<typeof customerRecipientSchema>;

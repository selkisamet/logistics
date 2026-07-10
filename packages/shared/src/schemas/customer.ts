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
  taxOffice: z.string().optional(), // vergi dairesi
  taxNumber: z.string().optional(), // vergi numarası
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
  taxOffice: z.string().nullable().optional(),
  taxNumber: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type Customer = z.infer<typeof customerSchema>;

/** Müşteri yetkili kişisi (çoklu). */
export const createCustomerContactSchema = z.object({
  name: z.string().min(2, 'Ad soyad gerekli'),
  role: z.string().optional(), // görev
  phone: z.string().optional(),
  email: z.string().email('Geçerli bir e-posta girin').optional().or(z.literal('')),
  extension: z.string().optional(), // dahili
});
export type CreateCustomerContactInput = z.infer<typeof createCustomerContactSchema>;

export const customerContactSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  extension: z.string().nullable(),
  createdAt: z.string(),
});
export type CustomerContact = z.infer<typeof customerContactSchema>;

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

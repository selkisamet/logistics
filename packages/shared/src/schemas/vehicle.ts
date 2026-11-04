import { z } from 'zod';
import { upperStr, upperOpt } from '../text';

/** Araç tipi serbest metindir; bunlar sadece hızlı seçim önerileridir. */
export const VEHICLE_TYPE_SUGGESTIONS = [
  'TIR',
  'KAMYON',
  'KAMYONET',
  'KIRKAYAK',
  'KAMYONET 50 NC',
  'PANELVAN',
  'DİĞER',
];

export const createVehicleSchema = z.object({
  plate: upperStr(z.string().min(2, 'Plaka gerekli')),
  type: upperStr(z.string().min(1, 'Araç tipi gerekli')).default('KAMYON'),
  driverName: upperOpt(),
  driverPhone: z.string().optional(),
  trailerPlate: upperOpt(), // dorse (tır)
  isSpot: z.boolean().optional(), // firmaya ait değil, o iş için tutuldu
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

/**
 * Plaka alanına yazılan, kayıtlı olmayan aracı ANINDA ekler (spot araç).
 * Aynı plaka zaten varsa yenisi açılmaz, mevcut kayıt döner.
 */
export const quickVehicleSchema = z.object({
  plate: upperStr(z.string().min(4, 'Plaka gerekli')),
});
export type QuickVehicleInput = z.infer<typeof quickVehicleSchema>;

export const updateVehicleSchema = createVehicleSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const vehicleSchema = z.object({
  id: z.string(),
  plate: z.string(),
  type: z.string(),
  driverName: z.string().nullable(),
  driverPhone: z.string().nullable(),
  trailerPlate: z.string().nullable(),
  isSpot: z.boolean().optional().default(false),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Vehicle = z.infer<typeof vehicleSchema>;

/** Ön ihbar / sevkiyatta gömülü araç özeti. */
export const vehicleSummarySchema = z.object({
  id: z.string(),
  plate: z.string(),
  driverName: z.string().nullable(),
  trailerPlate: z.string().nullable(),
});
export type VehicleSummary = z.infer<typeof vehicleSummarySchema>;

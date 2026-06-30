import { z } from 'zod';

/** Araç tipi serbest metindir; bunlar sadece hızlı seçim önerileridir. */
export const VEHICLE_TYPE_SUGGESTIONS = [
  'Tır',
  'Kamyon',
  'Kamyonet',
  'Kırkayak',
  'Kamyonet 50 NC',
  'Panelvan',
  'Diğer',
];

export const createVehicleSchema = z.object({
  plate: z.string().min(2, 'Plaka gerekli'),
  type: z.string().min(1, 'Araç tipi gerekli').default('Kamyon'),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  trailerPlate: z.string().optional(), // dorse (tır)
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

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

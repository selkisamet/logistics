import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { formatPlate } from './plate';
import { toast } from './toast';
import type { ComboOption } from '../components/ui';
import type {
  Customer,
  CustomerLocation,
  CustomerRecipient,
  Warehouse,
  Vehicle,
  Paginated,
} from '@lojistik/shared';

/** Seçim kutuları için tüm müşteriler (select). */
export function useCustomers() {
  return useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => api.get<Paginated<Customer>>('/customers?page=1&pageSize=100'),
    select: (d) => d.items,
  });
}

export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get<Warehouse[]>('/warehouses'),
  });
}

/** Aktif araçlar (plaka seçimi için). */
export function useVehicles() {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get<Vehicle[]>('/vehicles'),
    select: (list) => list.filter((v) => v.isActive),
  });
}

/** Bir müşterinin kaynak depoları. */
export function useCustomerLocations(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customers', customerId, 'locations'],
    queryFn: () => api.get<CustomerLocation[]>(`/customers/${customerId}/locations`),
    enabled: !!customerId,
  });
}

/** Bir müşterinin alıcıları (firmanın kendi müşterileri). */
export function useCustomerRecipients(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customers', customerId, 'recipients'],
    queryFn: () => api.get<CustomerRecipient[]>(`/customers/${customerId}/recipients`),
    enabled: !!customerId,
  });
}

/**
 * Plaka seçim kutusu seçenekleri — şirket araçları önce. Her plakanın yanında sahiplik
 * yazar: ÖZMAL (firmanın kendi aracı — sektörün yerleşik terimi) ya da SPOT (o iş için tutulan).
 */
export function vehicleOptions(vehicles: Vehicle[] | undefined): ComboOption[] {
  return [...(vehicles ?? [])]
    .sort((a, b) => Number(a.isSpot) - Number(b.isSpot) || a.plate.localeCompare(b.plate, 'tr'))
    .map((v) => ({
      value: v.id,
      label: v.plate,
      hint: v.driverName ?? undefined,
      badge: vehicleOwnership(v),
      badgeTone: v.isSpot ? ('warn' as const) : ('muted' as const),
    }));
}

export function vehicleOwnership(v: Pick<Vehicle, 'isSpot'>): 'ÖZMAL' | 'SPOT' {
  return v.isSpot ? 'SPOT' : 'ÖZMAL';
}

/**
 * Kayıtlı olmayan plakayı (spot araç) ANINDA ekler — Combobox `onCreate`'ine verilir.
 * Aynı plaka varsa sunucu mevcut kaydı döner, mükerrer araç açılmaz.
 */
export function useQuickVehicle() {
  const qc = useQueryClient();
  return async (text: string): Promise<ComboOption> => {
    try {
      const v = await api.post<Vehicle>('/vehicles/quick', { plate: formatPlate(text) });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      toast(`${v.plate} eklendi`);
      return vehicleOptions([v])[0];
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Araç eklenemedi');
      throw err;
    }
  };
}

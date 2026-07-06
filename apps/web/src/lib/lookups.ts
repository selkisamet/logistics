import { useQuery } from '@tanstack/react-query';
import { api } from './api';
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

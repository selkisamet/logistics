import { z } from 'zod';

/**
 * Denetim izi — "kim ne zaman ne yaptı".
 *
 * `AuditEvent` tablosuna baştan beri yazılıyordu ama hiçbir yerde okunmuyordu;
 * mal kabul ve sevkiyat detayındaki "Geçmiş" kartı bunu yüzeye çıkarır.
 */
export const auditEventSchema = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  metadata: z.unknown().nullable().optional(),
  userId: z.string().nullable(),
  userName: z.string().nullable(), // olay anındaki kullanıcının adı
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

/**
 * Olay adlarının Türkçe karşılığı. Listede olmayan bir action gelirse ham
 * değer basılır (`auditLabel`) — ekran boş kalmasın, yeni olay eklendiğinde
 * burayı güncellemeyi unutmak bir şeyi bozmasın.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'receipt.started': 'Mal kabul başlatıldı',
  'receipt.completed': 'Mal kabul tamamlandı',
  'receipt.cancelled': 'Mal kabul iptal edildi',
  'receipt.reopened': 'Mal kabul geri açıldı',
  'receipt.commercial_updated': 'Ticari bilgiler güncellendi',
  'dispatch.completed': 'Sevk edildi',
  'dispatch.cancelled': 'Sevkiyat geri alındı',
  'dispatch.quick': 'Hızlı sevk yapıldı',
  'dispatch.itemsAdded': 'Araca yük eklendi',
  'dispatch.vehicleChanged': 'Araç değiştirildi',
  'dispatch.waybillUpdated': 'İrsaliye bilgileri güncellendi',
  'dispatch.stopAdded': 'Durak eklendi',
  'dispatch.stopUpdated': 'Durak güncellendi',
  'dispatch.stopRemoved': 'Durak silindi',
  'dispatch.stopAssigned': 'Yük durağa atandı',
  'dispatch.stopsReordered': 'Rota sırası değiştirildi',
  'dispatch.stopsSuggested': 'Duraklar otomatik oluşturuldu',
};

export function auditLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

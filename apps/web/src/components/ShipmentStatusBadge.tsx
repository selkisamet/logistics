import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from '@lojistik/shared';
import { Badge } from './ui';

const COLORS: Record<ShipmentStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  EXPECTED: 'bg-blue-100 text-blue-700',
  IN_RECEIVING: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return <Badge className={COLORS[status]}>{SHIPMENT_STATUS_LABELS[status]}</Badge>;
}

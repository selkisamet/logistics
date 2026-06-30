import { DISPATCH_STATUS_LABELS, type DispatchStatus } from '@lojistik/shared';
import { Badge } from './ui';

const COLORS: Record<DispatchStatus, string> = {
  DRAFT: 'bg-amber-100 text-amber-700',
  DISPATCHED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

export function DispatchStatusBadge({ status }: { status: DispatchStatus }) {
  return <Badge className={COLORS[status]}>{DISPATCH_STATUS_LABELS[status]}</Badge>;
}

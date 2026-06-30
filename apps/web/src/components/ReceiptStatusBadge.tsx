import { RECEIPT_STATUS_LABELS, type ReceiptStatus } from '@lojistik/shared';
import { Badge } from './ui';

const COLORS: Record<ReceiptStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  return <Badge className={COLORS[status]}>{RECEIPT_STATUS_LABELS[status]}</Badge>;
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DISCREPANCY_TYPE_LABELS,
  DISCREPANCY_TYPES,
  type Attachment,
  type Discrepancy,
  type DiscrepancyType,
  type ReceiptLine,
} from '@lojistik/shared';
import { api, ApiError, uploadFiles } from '../lib/api';
import { Button, Card, Combobox, Field, Input } from './ui';

export function DiscrepancyModal({
  receiptId,
  lines,
  defaultLineId,
  defaultType,
  onClose,
}: {
  receiptId: string;
  lines: ReceiptLine[];
  defaultLineId?: string;
  defaultType?: DiscrepancyType;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<DiscrepancyType>(defaultType ?? 'DAMAGE');
  const [receiptLineId, setReceiptLineId] = useState(defaultLineId ?? '');
  const [qty, setQty] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      let attachmentIds: string[] = [];
      if (files.length > 0) {
        const uploaded = await uploadFiles<Attachment[]>('/attachments', files);
        attachmentIds = uploaded.map((a) => a.id);
      }
      return api.post<Discrepancy>('/discrepancies', {
        receiptId,
        receiptLineId: receiptLineId || undefined,
        type,
        qty: qty ? Number(qty) : undefined,
        description,
        attachmentIds,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts', receiptId] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Kayıt başarısız'),
  });

  const previews = files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <Card className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-b-none sm:rounded-xl">
        <h3 className="font-semibold text-slate-900">Tutanak / Fark Kaydı</h3>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Tür *">
            <Combobox
              options={DISCREPANCY_TYPES.map((t) => ({ value: t, label: DISCREPANCY_TYPE_LABELS[t] }))}
              value={type}
              onChange={(v) => setType(v as DiscrepancyType)}
            />
          </Field>
          <Field label="Adet (ops.)">
            <Input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </div>

        <Field label="İlgili kalem (ops.)">
          <Combobox
            options={lines.map((l) => ({ value: l.id, label: l.description }))}
            value={receiptLineId}
            onChange={setReceiptLineId}
            nullable
            nullableLabel="Genel (kaleme bağlı değil)"
          />
        </Field>

        <Field label="Açıklama *">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Örn: 1 koli ezilmiş, ıslak"
          />
        </Field>

        <div className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Fotoğraflar</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-white"
          />
          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {previews.map((p, i) => (
                <img key={i} src={p.url} alt={p.name} className="h-16 w-16 rounded-lg object-cover" />
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            className="flex-1"
            loading={mutation.isPending}
            disabled={!description.trim()}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            Kaydet
          </Button>
        </div>
      </Card>
    </div>
  );
}

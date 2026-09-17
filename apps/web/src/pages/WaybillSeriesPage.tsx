import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type WaybillSeriesState } from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { Button, Card, Field, Input, Spinner } from '../components/ui';
import { useAuthStore } from '../stores/auth';

/**
 * Matbu TAŞIMA İRSALİYESİ serisi — bir kez tanımlanır, sonra uygulama takip eder.
 *
 * Numarayı anlaşmalı matbaa basar (164 GT); uygulama numara ÜRETMEZ. Burada yalnız
 * matbaadan gelen koçanın seri harfi ve SIRADAKİ numarası girilir. Her sevkte (kâğıdın
 * fiilen kullanıldığı an) bir numara tüketilir ve sayaç bir artar — operatör her
 * sevkiyatta numara yazmaz.
 */
export function WaybillSeriesPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'SUPERVISOR';

  const { data, isLoading } = useQuery({
    queryKey: ['waybill-series'],
    queryFn: () => api.get<WaybillSeriesState>('/dispatches/waybill-series'),
  });

  const [serial, setSerial] = useState('');
  const [nextNo, setNextNo] = useState('');
  useEffect(() => {
    if (!data) return;
    setSerial(data.serial ?? '');
    setNextNo(data.nextNo != null ? String(data.nextNo) : '');
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      api.put<WaybillSeriesState>('/dispatches/waybill-series', { serial, nextNo }),
    onSuccess: (d) => {
      qc.setQueryData(['waybill-series'], d);
      toast('İrsaliye serisi kaydedildi.');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Kaydedilemedi'),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">İrsaliye Serisi</h2>
        <p className="text-sm text-slate-500">
          Matbaadan gelen taşıma irsaliyesi koçanının serisi ve sıradaki numarası
        </p>
      </div>

      <Card className="space-y-4">
        {data?.configured ? (
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-400">Bir sonraki sevkte kullanılacak numara</p>
            <p className="text-2xl font-bold tracking-wide text-slate-900">
              {data.serial} - {data.nextNo}
            </p>
          </div>
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Seri henüz tanımlanmadı — sevkiyatlara numara atanmıyor. Aşağıdan tanımlayın.
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label="Seri">
            <Input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="A"
              maxLength={4}
              disabled={!canEdit}
            />
          </Field>
          <div className="col-span-2">
            <Field label="Sıradaki Numara">
              <Input
                type="number"
                min={1}
                value={nextNo}
                onChange={(e) => setNextNo(e.target.value)}
                placeholder="Koçandaki ilk boş form no"
                disabled={!canEdit}
              />
            </Field>
          </div>
        </div>

        <ul className="space-y-1 text-xs text-slate-500">
          <li>
            • Numarayı <b>matbaa basar</b>; uygulama yalnızca sırayı takip eder.
          </li>
          <li>
            • Her <b>sevk edildiğinde</b> bir numara kullanılır ve sayaç bir artar. Taslak iptal
            edilirse numara harcanmaz.
          </li>
          <li>
            • Bir form <b>zayi olursa</b> (yırtılma, yanlış baskı) buradan sıradaki numarayı ileri
            alın — atlanan numara böylece boşa çıkmış olur.
          </li>
          <li>
            • Yeni koçan geldiğinde ilk formun numarasını girin.
          </li>
        </ul>

        {canEdit ? (
          <Button
            className="w-full"
            loading={mut.isPending}
            disabled={!serial.trim() || !nextNo}
            onClick={() => mut.mutate()}
          >
            Kaydet
          </Button>
        ) : (
          <p className="text-xs text-slate-400">Seriyi yalnız yönetici ya da sorumlu değiştirebilir.</p>
        )}
      </Card>
    </div>
  );
}

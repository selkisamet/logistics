import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PENDING_REGION_LABEL, type PickupTask } from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { confirmDialog } from '../lib/dialog';
import { formatDateTime } from '../lib/format';
import {
  useCustomers,
  useOpenPickupTasks,
  useQuickVehicle,
  useRegions,
  useVehicles,
  vehicleOptions,
} from '../lib/lookups';
import { formatPlate } from '../lib/plate';
import { ETA_TONE_CLASS, etaLabel, localDay } from '../lib/eta';
import { Icon } from '../components/icons';
import {
  Badge,
  Button,
  Card,
  Combobox,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
} from '../components/ui';

/**
 * Araç Görevleri — yönetici/sevkiyat müdürü aracı yüke GÖNDERİRKEN açar (gönderici +
 * plaka; bölge biliniyorsa). Araç depoya gelince depocu mal kabulde plakaya dokunur,
 * kabul bu bilgilerle dolu açılır. Bölge sonradan öğrenilirse karttaki seçimden girilir.
 */
export function PickupTasksPage() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PickupTask | null>(null);
  const { data: open, isLoading } = useOpenPickupTasks();
  const { data: received } = useQuery({
    queryKey: ['pickup-tasks', 'RECEIVED'],
    queryFn: () => api.get<PickupTask[]>('/pickup-tasks?status=RECEIVED'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Araç Görevleri</h2>
          <p className="text-sm text-slate-500">
            Aracı yüke gönderirken açın. Araç depoya gelince depocu plakaya dokunur, bilgiler
            kendiliğinden dolar.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>+ Yeni</Button>
      </div>

      <h3 className="text-sm font-semibold text-slate-500">
        Yolda {open ? `(${open.length})` : ''}
      </h3>
      {isLoading ? (
        <Spinner />
      ) : !open || open.length === 0 ? (
        <EmptyState title="Yolda araç yok" hint="Bir aracı yüke gönderdiğinizde buraya ekleyin." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {open.map((t) => (
            <OpenTaskCard key={t.id} task={t} onEdit={() => setEditing(t)} />
          ))}
        </div>
      )}

      {received && received.length > 0 && (
        <>
          <h3 className="pt-2 text-sm font-semibold text-slate-500">Depoya gelenler (son)</h3>
          <div className="flex flex-col gap-2">
            {received.map((t) => (
              <Link
                key={t.id}
                to={t.receiptId ? `/mal-kabul/${t.receiptId}` : '#'}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                <span className="min-w-0 truncate">
                  <b>{t.vehicle.plate}</b> · {t.customer.name}
                </span>
                <span className="shrink-0 text-xs text-slate-500">{t.receiptReference}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {adding && (
        <Modal title="Yeni Araç Görevi" onClose={() => setAdding(false)}>
          <TaskForm onDone={() => setAdding(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Görevi Düzenle" description={editing.vehicle.plate} onClose={() => setEditing(null)}>
          <TaskForm task={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

function OpenTaskCard({ task, onEdit }: { task: PickupTask; onEdit: () => void }) {
  const qc = useQueryClient();
  const { data: regions } = useRegions();
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : 'Kaydedilemedi');

  // Müşteri haber verince bölge buradan TEK dokunuşla girilir — modal açmaya gerek yok
  const setRegion = useMutation({
    mutationFn: (regionId: string) =>
      api.patch<PickupTask>(`/pickup-tasks/${task.id}`, { regionId: regionId || null }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['pickup-tasks'] });
      toast(`${t.vehicle.plate}: ${t.region?.name ?? PENDING_REGION_LABEL}`);
    },
    onError,
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/pickup-tasks/${task.id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pickup-tasks'] });
      toast('Görev iptal edildi');
    },
    onError,
  });

  const eta = etaLabel(task.expectedDate, task.expectedTime);

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-lg font-bold text-slate-900">
            <Icon name="truck" className="h-4 w-4" /> {task.vehicle.plate}
          </p>
          <p className="truncate text-sm text-slate-700">
            {task.customer.name}
            {task.recipientCustomer ? ` → ${task.recipientCustomer.name}` : ''}
          </p>
        </div>
        <Badge className={`shrink-0 ${ETA_TONE_CLASS[eta.tone]}`}>{eta.text}</Badge>
      </div>

      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm text-slate-500">Bölge</span>
        <Select
          value={task.region?.id ?? ''}
          disabled={setRegion.isPending}
          onChange={(e) => setRegion.mutate(e.target.value)}
          className={task.region ? '' : 'border-amber-300 bg-amber-50 text-amber-800'}
        >
          <option value="">Bölge seç…</option>
          {(regions ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-400">
        <span>
          {formatDateTime(task.createdAt)}
          {task.createdBy ? ` · ${task.createdBy}` : ''}
        </span>
        <span className="flex gap-3">
          <button onClick={onEdit} className="font-medium text-brand">
            Düzenle
          </button>
          <button
            onClick={async () => {
              if (
                await confirmDialog({
                  message: `${task.vehicle.plate} görevi iptal edilsin mi?`,
                  confirmText: 'İptal Et',
                  danger: true,
                })
              )
                cancel.mutate();
            }}
            className="font-medium text-red-600"
          >
            İptal
          </button>
        </span>
      </div>
    </Card>
  );
}

function TaskForm({ task, onDone }: { task?: PickupTask; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: customers } = useCustomers();
  const { data: vehicles } = useVehicles();
  const quickVehicle = useQuickVehicle();
  const { data: regions } = useRegions();
  const [customerId, setCustomerId] = useState(task?.customer.id ?? '');
  const [vehicleId, setVehicleId] = useState(task?.vehicle.id ?? '');
  const [regionId, setRegionId] = useState(task?.region?.id ?? '');
  const [recipientId, setRecipientId] = useState(task?.recipientCustomer?.id ?? '');
  // Tahmini geliş: yeni görevde varsayılan BUGÜN (araçların çoğu aynı gün gelir → dokunmadan geçilir)
  const [expectedDate, setExpectedDate] = useState(task ? (task.expectedDate ?? '') : localDay(0));
  const [expectedTime, setExpectedTime] = useState(task?.expectedTime ?? '');
  const today = localDay(0);
  // "Yarın" düğmesi yok: takvimden seçilir (az seçenek = hızlı karar)
  const dayMode = expectedDate === today ? 'today' : expectedDate ? 'other' : 'none';
  const [pickingDate, setPickingDate] = useState(dayMode === 'other');

  const customerOptions = (customers ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    hint: `(${c.code})`,
  }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        customerId,
        vehicleId,
        regionId: regionId || (task ? null : undefined),
        recipientCustomerId: recipientId || (task ? null : undefined),
        expectedDate: expectedDate || (task ? null : undefined),
        expectedTime: expectedDate && expectedTime ? expectedTime : task ? null : undefined,
      };
      return task
        ? api.patch<PickupTask>(`/pickup-tasks/${task.id}`, body)
        : api.post<PickupTask>('/pickup-tasks', body);
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['pickup-tasks'] });
      toast(task ? 'Görev güncellendi' : `${t.vehicle.plate} yola çıktı`);
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Kaydedilemedi'),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-3"
    >
      <Field label="Gönderici *">
        <Combobox
          options={customerOptions}
          value={customerId}
          onChange={setCustomerId}
          placeholder="Malı kimden alacak?"
        />
      </Field>
      <Field label="Araç *">
        <Combobox
          options={vehicleOptions(vehicles)}
          value={vehicleId}
          onChange={setVehicleId}
          // Spot araç kayıtlı değil: plakayı yazıp "ekle" — Araçlar sayfasına gitmeden
          onCreate={quickVehicle}
          formatQuery={formatPlate}
          placeholder="Plaka seç ya da yaz..."
        />
      </Field>

      {/* Depoya tahmini geliş — gün tek dokunuş, saat opsiyonel (bilinmiyorsa uydurulmasın) */}
      <div className="space-y-1">
        <span className="text-sm font-medium text-slate-700">Depoya geliş</span>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['today', 'Bugün', today],
              ['other', 'Tarih seç', null],
              ['none', 'Bilinmiyor', ''],
            ] as const
          ).map(([mode, label, day]) => {
            const onClick = () => {
              // null = "Tarih seç": takvim açılır, mevcut gün korunur
              setPickingDate(day === null);
              if (day !== null) setExpectedDate(day);
            };
            const on = mode === 'other' ? pickingDate || dayMode === 'other' : !pickingDate && dayMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={onClick}
                className={
                  on
                    ? 'rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white'
                    : 'rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200'
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {pickingDate && (
            <Input
              type="date"
              min={today}
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-auto"
            />
          )}
          {expectedDate && (
            <Input
              type="time"
              value={expectedTime}
              onChange={(e) => setExpectedTime(e.target.value)}
              className="w-auto"
              aria-label="Saat (opsiyonel)"
              title="Saat (opsiyonel)"
            />
          )}
          {expectedDate && !expectedTime && (
            <span className="self-center text-xs text-slate-400">Saat opsiyonel</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Boş bırakılabilir: bilinmiyorsa mal BEKLEYEN alanına iner. "Seçimi kaldır"
            yalnız bir değer seçiliyken çıkar — boş form "Bilinmiyor" satırıyla kalabalıklaşmasın. */}
        <Field label="Bölge">
          <Combobox
            options={(regions ?? []).map((r) => ({ value: r.id, label: r.name }))}
            value={regionId}
            onChange={setRegionId}
            nullable={!!regionId}
            nullableLabel="Seçimi kaldır"
            placeholder="Bölge seç..."
          />
        </Field>
        <Field label="Alıcı">
          <Combobox
            options={customerOptions}
            value={recipientId}
            onChange={setRecipientId}
            nullable={!!recipientId}
            nullableLabel="Seçimi kaldır"
            placeholder="Alıcı ara / seç..."
          />
        </Field>
      </div>
      <Button
        type="submit"
        className="w-full"
        loading={save.isPending}
        disabled={!customerId || !vehicleId}
      >
        {task ? 'Kaydet' : 'Aracı Yola Çıkar'}
      </Button>
    </form>
  );
}

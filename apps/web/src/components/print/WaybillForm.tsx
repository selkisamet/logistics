import { QRCodeSVG } from 'qrcode.react';
import { VAT_RATE, type Dispatch } from '@lojistik/shared';
import { COMPANY } from '../../lib/company';
import { formatDate, formatMoney } from '../../lib/format';
import { PrintableDocModal, type CopyOption } from './PrintableDocModal';
import { MetaLine, FieldLine } from './FormLines';

/**
 * TAŞIMA İRSALİYESİ (VUK 240/A + 209) — A4 DİKEY matbu form.
 *
 * Yasal zorunlu içerik: taşıyıcı ünvan/adres/VD-VKN · seri-sıra no · düzenleme tarihi ·
 * malın cinsi ve miktarı · kim gönderdi · kime gönderildi · nereden nereye · taşıma ücreti ·
 * araç plakası + sürücü adı.
 *
 * Seri/sıra numarasını ANLAŞMALI MATBAA basar; uygulama yalnızca operatörün girdiği
 * matbu numarayı yazar (kâğıt ile dijital kaydı eşlemek için).
 *
 * Nüsha dağıtımı tesellüm fişinden FARKLI (VUK): ① eşyayı taşıttırana ② araçta (sürücüde)
 * ③ bizde saklanır.
 */

/** Matbu formdaki SABİT satır sayısı — tesellüm fişindeki FORM_ROWS ile aynı mantık:
 *  geometri veriye göre değişirse matbu forma hizalama bozulur. */
export const WAYBILL_ROWS = 8;

const WAYBILL_COPIES: CopyOption[] = [
  { key: 'none', label: 'Nüsha yok', badge: '' },
  { key: 'c1', label: '1· Gönderici', badge: '1. NÜSHA · GÖNDERİCİ' },
  { key: 'c2', label: '2· Araçta', badge: '2. NÜSHA · ARAÇTA (SÜRÜCÜ)' },
  { key: 'c3', label: '3· Dosya', badge: '3. NÜSHA · DOSYA' },
];

/** Belgedeki bir satır: durak × kabul (bir kabulün bir durakta inen kısmı). */
type WaybillLine = {
  key: string;
  sender: string; // kim gönderdi
  recipient: string; // kime gönderildi
  from: string; // nereden
  to: string; // nereye
  kind: string; // malın cinsi
  qty: string; // miktarı
};

/** Sevkiyattaki yükleri duraklara göre satırlara böler. Durağı olmayanlar sonda listelenir. */
export function buildWaybillLines(d: Dispatch): WaybillLine[] {
  const lines: WaybillLine[] = [];
  const stops = [...(d.stops ?? [])].sort((a, b) => a.seq - b.seq);
  // stopId -> durak; null anahtarı "atanmamış" grubudur
  const groups: { stopId: string | null; name: string; address: string | null }[] = [
    ...stops.map((s) => ({ stopId: s.id, name: s.name, address: s.address ?? null })),
    { stopId: null, name: 'ATANMAMIŞ', address: null },
  ];

  for (const g of groups) {
    // Bu duraktaki paletleri kabule göre grupla (aynı kabulden çok palet → tek satır)
    const pkgs = d.packages.filter((p) => (p.stopId ?? null) === g.stopId);
    const byReceipt = new Map<string, { sender: string; from: string; count: number; ref: string }>();
    for (const p of pkgs) {
      const key = p.receiptId ?? p.receiptReference;
      const cur = byReceipt.get(key) ?? {
        sender: p.customerName ?? '',
        from: p.warehouseName ?? '',
        count: 0,
        ref: p.receiptReference,
      };
      cur.count += 1;
      byReceipt.set(key, cur);
    }
    for (const [key, r] of byReceipt) {
      lines.push({
        key: `${g.stopId ?? 'x'}-p-${key}`,
        sender: r.sender,
        recipient: g.name,
        from: r.from,
        to: g.address || g.name,
        kind: 'Palet',
        qty: String(r.count),
      });
    }
    // Paletsiz (kabul düzeyi) sevkler
    for (const rc of (d.receipts ?? []).filter((r) => (r.stopId ?? null) === g.stopId)) {
      lines.push({
        key: `${g.stopId ?? 'x'}-r-${rc.id}`,
        sender: rc.customerName ?? '',
        recipient: g.name,
        from: rc.warehouseName ?? '',
        to: g.address || g.name,
        kind: 'Muhtelif',
        qty: String(rc.itemCount),
      });
    }
  }
  return lines;
}

export function WaybillModal({ dispatch, onClose }: { dispatch: Dispatch; onClose: () => void }) {
  const lines = buildWaybillLines(dispatch);
  const unassigned = [
    ...dispatch.packages.filter((p) => !p.stopId),
    ...(dispatch.receipts ?? []).filter((r) => !r.stopId),
  ].length;

  return (
    <PrintableDocModal
      title="Taşıma İrsaliyesi"
      documentTitle={`TasimaIrsaliyesi_${dispatch.reference}`}
      pageSize="A4 portrait"
      copies={WAYBILL_COPIES}
      onClose={onClose}
      blankHint={
        <>
          3 nüshalı koçan için: <b>Nüsha</b>'yı sırayla <b>Gönderici → Araçta → Dosya</b> seçip her
          birini ayrı PDF'e basın (VUK: ① eşyayı taşıttırana ② araçta bulunur ③ bizde saklanır).
          Master, açık sevkiyattan bağımsızdır: mal tablosu her zaman <b>{WAYBILL_ROWS} satır</b>.
          <b> Seri/sıra numarasını matbaa basar</b> — uygulama yalnızca girdiğiniz numarayı yazar.
        </>
      }
      overflowWarning={
        <>
          {lines.length > WAYBILL_ROWS && (
            <div>
              ⚠ Bu sevkiyatta {lines.length} satır var; matbu form {WAYBILL_ROWS} satırlık. Fazlası
              basılı kutuların dışına taşar — sevkiyatı bölün.
            </div>
          )}
          {unassigned > 0 && (
            <div>
              ⚠ {unassigned} yük hiçbir durağa atanmamış; belgede "ATANMAMIŞ" olarak görünür. Önce
              durakları atayın.
            </div>
          )}
          {!COMPANY.taxNumber && (
            <div>⚠ Taşıyıcı vergi dairesi/VKN girilmemiş (yasal zorunlu) — company.ts'e ekleyin.</div>
          )}
        </>
      }
    >
      {({ copyBadge, blank }) => (
        <WaybillDoc dispatch={dispatch} copyBadge={copyBadge} blank={blank} lines={lines} />
      )}
    </PrintableDocModal>
  );
}

function WaybillDoc({
  dispatch,
  copyBadge,
  blank,
  lines,
}: {
  dispatch: Dispatch;
  copyBadge: string;
  blank: boolean;
  lines: WaybillLine[];
}) {
  // Master (blank) modda satırlar veriden bağımsız — hep WAYBILL_ROWS boş satır
  const rows = blank ? [] : lines;
  const blanks = Math.max(0, WAYBILL_ROWS - rows.length);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const docUrl = origin ? `${origin}/sevkiyat/${dispatch.id}` : dispatch.reference;
  const logoUrl = origin ? `${origin}${COMPANY.logoPath}` : COMPANY.logoPath;

  // Taşıma ücreti (VUK zorunlu alan): KDV dahil/hariç ayrımı
  const gross = dispatch.freightAmount ?? 0;
  const vatIncluded = !!dispatch.freightVatIncluded;
  const net = vatIncluded ? gross / (1 + VAT_RATE) : gross;
  const vat = vatIncluded ? gross - net : gross * VAT_RATE;
  const grand = vatIncluded ? gross : gross + vat;

  // Satır (yatay) çizgi YOK, yalnız sütun (dikey) çizgileri — `border-x`.
  // Başlık hücresi alt çizgisini korur (başlığı gövdeden ayırır).
  const th = 'border border-sky-800 px-1 py-0.5 text-[8px] font-bold uppercase text-sky-800';
  const td = 'border-x border-sky-800 px-1 py-1 align-top text-[9px]';

  const plate = dispatch.vehicle?.plate ?? dispatch.vehiclePlate ?? '';
  const trailer = dispatch.vehicle?.trailerPlate ?? '';
  const driver = dispatch.vehicle?.driverName ?? dispatch.driverName ?? '';
  const serial = [dispatch.waybillSerial, dispatch.waybillNo].filter(Boolean).join(' - ');

  return (
    <div className="slip-chrome flex min-h-[277mm] flex-1 flex-col border-2 border-sky-800">
      {/* Başlık: logo + yetki belgeleri + QR | belge bilgileri */}
      <div className="flex border-b-2 border-sky-800">
        <div className="flex w-[46%] items-center gap-2 border-r-2 border-sky-800 p-2">
          <div className="flex flex-1 flex-col items-center justify-center gap-1 overflow-hidden">
            <img
              src={logoUrl}
              alt={COMPANY.name}
              className="h-[62px] w-auto max-w-[175px] object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="flex flex-wrap justify-center gap-1">
              {COMPANY.docs.map((d) => (
                <div
                  key={d.code}
                  className="flex flex-col overflow-hidden rounded border border-sky-800 text-center leading-none text-sky-800"
                >
                  <span className="border-b border-sky-800 px-1.5 py-0.5 text-[10px] font-black">
                    {d.code}
                  </span>
                  <span className="px-1.5 py-0.5 text-[6px]">
                    {d.no.split('.').slice(-2).join('.')}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="slip-data flex flex-col items-center">
            <QRCodeSVG value={docUrl} size={48} />
            <span className="mt-0.5 text-[7px] font-semibold">{dispatch.reference}</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-2">
          {copyBadge && (
            <div className="mb-0.5 self-end rounded-sm border border-sky-800 px-1.5 py-0.5 text-[8px] font-black tracking-wide text-sky-800">
              {copyBadge}
            </div>
          )}
          <h1 className="text-right text-base font-black tracking-wide text-sky-800">
            TAŞIMA İRSALİYESİ
          </h1>
          <div className="mt-1 space-y-0.5">
            <MetaLine label="SERİ / SIRA NO" value={serial} />
            <MetaLine
              label="DÜZENLEME TARİHİ"
              value={formatDate(dispatch.waybillDate ?? dispatch.dispatchedAt ?? dispatch.createdAt)}
            />
            <MetaLine label="SEVKİYAT REF." value={dispatch.reference} />
            <MetaLine label="PLAKA" value={trailer ? `${plate} / ${trailer}` : plate} />
            <MetaLine label="SÜRÜCÜ" value={driver} />
          </div>
        </div>
      </div>

      {/* TAŞIYICI (bizim firma) — VUK: ünvan, adres, VD, VKN zorunlu */}
      <div className="border-b-2 border-sky-800 p-2">
        <p className="mb-1 text-[9px] font-bold uppercase text-sky-800">Taşıyıcı / Carrier</p>
        <div className="flex gap-4">
          <div className="flex-1">
            <FieldLine label="ADI, ÜNVANI" value={COMPANY.name} lines={2} labelWidth={78} />
            <FieldLine label="V. DAİRESİ" value={COMPANY.taxOffice} labelWidth={78} />
            <FieldLine label="V. NO" value={COMPANY.taxNumber} labelWidth={78} />
          </div>
          <div className="flex-1">
            <FieldLine
              label="ADRESİ"
              value={COMPANY.branches[0]?.address ?? ''}
              lines={2}
              labelWidth={52}
            />
            <FieldLine label="TEL" value={COMPANY.branches[0]?.phone ?? ''} labelWidth={52} />
            <FieldLine label="WEB" value={COMPANY.website} labelWidth={52} />
          </div>
        </div>
      </div>

      {/* Taşınan mallar — kim gönderdi / kime / nereden nereye / cinsi / miktarı.
          Tablo alanı doldurur: sütun çizgileri aşağıya kadar iner (matbu form görünümü). */}
      <div className="flex-1">
        <table className="h-full w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-[6%]`}>SIRA</th>
              <th className={th}>GÖNDEREN</th>
              <th className={th}>ALICI</th>
              <th className={th}>NEREDEN</th>
              <th className={th}>NEREYE</th>
              <th className={`${th} w-[12%]`}>CİNSİ</th>
              <th className={`${th} w-[9%] text-right`}>MİKTAR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={l.key}>
                <td className={`${td} text-center`}>
                  <span className="slip-data">{i + 1}</span>
                </td>
                <td className={td}>
                  <span className="slip-data">{l.sender}</span>
                </td>
                <td className={td}>
                  <span className="slip-data">{l.recipient}</span>
                </td>
                <td className={td}>
                  <span className="slip-data">{l.from}</span>
                </td>
                <td className={td}>
                  <span className="slip-data">{l.to}</span>
                </td>
                <td className={td}>
                  <span className="slip-data">{l.kind}</span>
                </td>
                <td className={`${td} text-right font-semibold`}>
                  <span className="slip-data">{l.qty}</span>
                </td>
              </tr>
            ))}
            {Array.from({ length: blanks }).map((_, i) => (
              <tr key={`b${i}`}>
                <td className={`${td} text-center text-slate-300`}>
                  <span className="slip-data">{rows.length + i + 1}</span>
                </td>
                <td className={td}>&nbsp;</td>
                <td className={td} />
                <td className={td} />
                <td className={td} />
                <td className={td} />
                <td className={td} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Taşıma ücreti (VUK zorunlu) + beyan/imza */}
      <div className="flex border-t-2 border-sky-800">
        <div className="flex-1 border-r-2 border-sky-800 p-2">
          <p className="text-[9px] text-slate-700">
            Yukarıda cinsi ve miktarı yazılı mallar, belirtilen adreslere taşınmak üzere teslim
            alınmıştır. İşbu irsaliyenin bir nüshası eşyayı taşıttırana, bir nüshası araçta bulunur,
            bir nüshası saklanır.
          </p>
          {dispatch.notes && (
            <p className="slip-data mt-1 text-[8px] text-slate-500">Not: {dispatch.notes}</p>
          )}
          <p className="mt-3 text-[9px] font-semibold text-slate-600">Teslim Eden / Kaşe - İmza</p>
        </div>
        <div className="w-[38%] p-2">
          <p className="mb-1 text-[9px] font-bold uppercase text-sky-800">Taşıma Ücreti</p>
          <div className="space-y-0.5">
            <MetaLine label="ARA TOPLAM" value={gross ? formatMoney(net) : ''} labelWidth={86} />
            <MetaLine
              label={`KDV %${Math.round(VAT_RATE * 100)}`}
              value={gross ? formatMoney(vat) : ''}
              labelWidth={86}
            />
            <MetaLine label="GENEL TOPLAM" value={gross ? formatMoney(grand) : ''} labelWidth={86} />
          </div>
        </div>
      </div>

      {/* Firma iletişim şeridi */}
      <div className="border-t-2 border-sky-800 px-2 py-1 text-center text-[7px] text-sky-800">
        <p className="font-bold">
          {COMPANY.name}
          {COMPANY.website ? ` · ${COMPANY.website}` : ''}
        </p>
        <div className="mt-0.5 flex flex-wrap justify-center gap-x-3 gap-y-0">
          {COMPANY.branches.map((b) => (
            <span key={b.name}>
              <span className="font-bold">{b.name}:</span> {b.address} · Tel: {b.phone} · {b.email}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

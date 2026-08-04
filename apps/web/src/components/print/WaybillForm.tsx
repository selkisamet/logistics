import { QRCodeSVG } from 'qrcode.react';
import { PACKAGE_TYPE_LABELS, VAT_RATE, type Dispatch, type PackageType } from '@lojistik/shared';
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

/** Taşıma ücreti özet satırları (tablo içinde basılır, sütun çizgileri kesilmesin diye). */
const FREIGHT_ROWS: { label: string; value: (net: number, vat: number, grand: number) => number }[] = [
  { label: 'ARA TOPLAM', value: (net) => net },
  { label: `KDV %${Math.round(VAT_RATE * 100)}`, value: (_n, vat) => vat },
  { label: 'GENEL TOPLAM', value: (_n, _v, grand) => grand },
];

const WAYBILL_COPIES: CopyOption[] = [
  { key: 'none', label: 'Nüsha yok', badge: '' },
  { key: 'c1', label: '1· Gönderici', badge: '1. NÜSHA · GÖNDERİCİ' },
  { key: 'c2', label: '2· Araçta', badge: '2. NÜSHA · ARAÇTA (SÜRÜCÜ)' },
  { key: 'c3', label: '3· Dosya', badge: '3. NÜSHA · DOSYA' },
];

/** Belgedeki bir satır: durak × kabul (bir kabulün bir durakta inen kısmı).
 *  Sütun düzeni klasik parsiyel ambar irsaliyesi yapısındadır. */
type WaybillLine = {
  key: string;
  receiptRef: string; // TESELLÜM MAKBUZ NO — fişle eşleşme
  qty: string; // ADET
  unit: string; // NEVİ (palet/koli/IBC...)
  kind: string; // MALIN CİNSİ
  sender: string; // GÖNDERENİN ADI SOYADI
  recipient: string; // ALICININ ADI SOYADI
};

/** Sevkiyattaki yükleri duraklara göre satırlara böler. Durağı olmayanlar sonda listelenir. */
export function buildWaybillLines(d: Dispatch): WaybillLine[] {
  const lines: WaybillLine[] = [];
  const stops = [...(d.stops ?? [])].sort((a, b) => a.seq - b.seq);
  // stopId -> durak; null anahtarı "atanmamış" grubudur
  const groups: { stopId: string | null; name: string }[] = [
    ...stops.map((s) => ({ stopId: s.id, name: s.name })),
    { stopId: null, name: 'ATANMAMIŞ' },
  ];

  for (const g of groups) {
    // Bu duraktaki paletleri kabule göre grupla (aynı kabulden çok palet → tek satır)
    const pkgs = d.packages.filter((p) => (p.stopId ?? null) === g.stopId);
    const byReceipt = new Map<
      string,
      { sender: string; ref: string; kind: string; count: number; types: Set<string> }
    >();
    for (const p of pkgs) {
      const key = p.receiptId ?? p.receiptReference;
      const cur = byReceipt.get(key) ?? {
        sender: p.customerName ?? '',
        ref: p.receiptReference,
        kind: p.goodsKind ?? '',
        count: 0,
        types: new Set<string>(),
      };
      cur.count += 1;
      cur.types.add(PACKAGE_TYPE_LABELS[p.type as PackageType] ?? p.type);
      byReceipt.set(key, cur);
    }
    for (const [key, r] of byReceipt) {
      lines.push({
        key: `${g.stopId ?? 'x'}-p-${key}`,
        receiptRef: r.ref,
        qty: String(r.count),
        unit: r.types.size === 1 ? [...r.types][0] : 'Muhtelif',
        kind: r.kind,
        sender: r.sender,
        recipient: g.name,
      });
    }
    // Paletsiz (kabul düzeyi) sevkler — adet satır toplamından gelir
    for (const rc of (d.receipts ?? []).filter((r) => (r.stopId ?? null) === g.stopId)) {
      lines.push({
        key: `${g.stopId ?? 'x'}-r-${rc.id}`,
        receiptRef: rc.reference,
        qty: String(rc.itemCount),
        unit: 'Adet',
        kind: rc.goodsKind ?? '',
        sender: rc.customerName ?? '',
        recipient: g.name,
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
  const totalQty = rows.reduce((s, l) => s + (Number(l.qty) || 0), 0);

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
  // Mal satırları SABİT yükseklikte; kalan alanı sondaki dolgu satırı yutar
  // (aksi halde h-full tüm satırlara dağılır ve satırlar aşırı açılır).
  const tdRow = `${td} h-[6mm]`;

  const plate = dispatch.vehicle?.plate ?? dispatch.vehiclePlate ?? '';
  const trailer = dispatch.vehicle?.trailerPlate ?? '';
  const driver = dispatch.vehicle?.driverName ?? dispatch.driverName ?? '';
  const serial = [dispatch.waybillSerial, dispatch.waybillNo].filter(Boolean).join(' - ');
  // ÇIKIŞ YERİ = yükün alındığı depo (tüm kabuller aynı depodan gelir; ilkini kullan)
  const departure =
    dispatch.packages[0]?.warehouseName ?? dispatch.receipts?.[0]?.warehouseName ?? '';

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
              label="TARİH"
              value={formatDate(dispatch.waybillDate ?? dispatch.dispatchedAt ?? dispatch.createdAt)}
            />
            <MetaLine label="ÇIKIŞ YERİ" value={departure} />
            <MetaLine label="GİDECEĞİ YER" value={dispatch.destination} />
            <MetaLine label="PLAKA NO" value={trailer ? `${plate} / ${trailer}` : plate} />
            <MetaLine label="SÜRÜCÜNÜN ADI SOYADI" value={driver} />
            <MetaLine label="SEVKİYAT REF." value={dispatch.reference} />
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

      {/* Taşınan mallar — klasik parsiyel ambar irsaliyesi sütun düzeni.
          KİLO / FATURA NO / TUTAR / İZAHAT matbu formda ELLE doldurulur (uygulamada karşılığı yok).
          Tablo alanı doldurur: sütun çizgileri aşağıya kadar iner (matbu form görünümü). */}
      {/* Kapsayıcı `flex` olmalı: blok kapsayıcıda tablonun `height:100%`'i çözülmez
          (flex öğesinin hesaplanan yüksekliği `auto` kalır) ve tablo içeriği kadar
          kısa kalır → sütun çizgileri yarıda biter. Flex'te `align-items:stretch`
          tabloyu alana yayar. */}
      <div className="flex flex-1">
        <table className="h-full w-full table-fixed border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-[11%]`}>TESELLÜM MAKBUZ NO</th>
              <th className={`${th} w-[5%]`}>ADET</th>
              <th className={`${th} w-[7%]`}>NEVİ</th>
              <th className={`${th} w-[7%]`}>KİLO</th>
              <th className={`${th} w-[14%]`}>MALIN CİNSİ</th>
              <th className={`${th} w-[17%]`}>GÖNDERENİN ADI SOYADI</th>
              <th className={`${th} w-[17%]`}>ALICININ ADI SOYADI</th>
              <th className={`${th} w-[7%]`}>FATURA NO</th>
              <th className={`${th} w-[8%]`}>TUTARI U/A</th>
              <th className={`${th} w-[8%]`}>TUTARI P/O</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.key}>
                <td className={`${tdRow} text-center`}>
                  <span className="slip-data">{l.receiptRef}</span>
                </td>
                <td className={`${tdRow} text-center font-semibold`}>
                  <span className="slip-data">{l.qty}</span>
                </td>
                <td className={tdRow}>
                  <span className="slip-data">{l.unit}</span>
                </td>
                <td className={tdRow} />
                <td className={tdRow}>
                  <span className="slip-data">{l.kind}</span>
                </td>
                <td className={tdRow}>
                  <span className="slip-data">{l.sender}</span>
                </td>
                <td className={tdRow}>
                  <span className="slip-data">{l.recipient}</span>
                </td>
                <td className={tdRow} />
                <td className={tdRow} />
                <td className={tdRow} />
              </tr>
            ))}
            {Array.from({ length: blanks }).map((_, i) => (
              <tr key={`b${i}`}>
                <td className={tdRow}>&nbsp;</td>
                <td className={tdRow} />
                <td className={tdRow} />
                <td className={tdRow} />
                <td className={tdRow} />
                <td className={tdRow} />
                <td className={tdRow} />
                <td className={tdRow} />
                <td className={tdRow} />
                <td className={tdRow} />
              </tr>
            ))}
            {/* Toplam adet — matbu formdaki gibi tablo sonunda */}
            <tr>
              <td className={`${td} text-right text-[8px] font-bold`}>TOPLAM</td>
              <td className={`${td} text-center font-bold`}>
                <span className="slip-data">{totalQty || ' '}</span>
              </td>
              <td className={td} />
              <td className={td} />
              <td className={td} />
              <td className={td} />
              <td className={td} />
              <td className={td} />
              <td className={td} />
              <td className={td} />
            </tr>
            {/* Taşıma ücreti (VUK zorunlu) — tablo içinde, sütun çizgileri kesilmesin */}
            {FREIGHT_ROWS.map((f) => (
              <tr key={f.label}>
                <td className={td} />
                <td className={td} />
                <td className={td} />
                <td className={td} />
                <td className={td} />
                <td className={td} />
                <td className={td} />
                <td className={`${td} whitespace-nowrap text-right text-[8px] font-bold`} colSpan={2}>
                  {f.label}
                </td>
                <td className={`${td} text-right`}>
                  <span className="slip-data">{gross ? formatMoney(f.value(net, vat, grand)) : ' '}</span>
                </td>
              </tr>
            ))}
            {/* Dolgu satırı: sütun çizgilerini sayfanın altına kadar indirir (matbu form görünümü).
                `h-full` kalan alanı yutar; `min-h` esnetme çalışmazsa güvence sağlar. */}
            <tr className="h-full">
              <td className={`${td} min-h-[95mm]`} style={{ height: '95mm' }} />
              <td className={td} />
              <td className={td} />
              <td className={td} />
              <td className={td} />
              <td className={td} />
              <td className={td} />
              <td className={td} />
              <td className={td} />
              <td className={td} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Beyan + imza — tablonun altında (sütun çizgileri buraya kadar iner) */}
      <div className="border-t-2 border-sky-800 p-2">
        <p className="text-[8px] text-slate-700">
          Yukarıda cinsi ve miktarı yazılı mallar, belirtilen adreslere taşınmak üzere teslim
          alınmıştır. İşbu irsaliyenin bir nüshası eşyayı taşıttırana, bir nüshası araçta bulunur, bir
          nüshası saklanır.
        </p>
        {dispatch.notes && (
          <p className="slip-data mt-0.5 text-[8px] text-slate-500">Not: {dispatch.notes}</p>
        )}
        {/* İmza alanları — klasik ambar irsaliyesindeki üçlü düzen */}
        <div className="mt-5 flex gap-4 text-center text-[9px] font-semibold text-slate-600">
          <span className="flex-1 border-t border-slate-400 pt-0.5">Teslim Eden</span>
          <span className="flex-1 border-t border-slate-400 pt-0.5">
            Nakliyeci Adı, Soyadı / İmza
          </span>
          <span className="flex-1 border-t border-slate-400 pt-0.5">Teslim Alan</span>
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

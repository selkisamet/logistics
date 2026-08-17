import { QRCodeSVG } from 'qrcode.react';
import {
  PACKAGE_TYPE_LABELS,
  VAT_RATE,
  type Dispatch,
  type DispatchStop,
  type PackageType,
} from '@lojistik/shared';
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

/** Sütunlar TEK kaynaktan: hem tablo başlığı hem de arkadaki çizgi katmanı bunu kullanır
 *  (genişlikler ayrışırsa çizgiler hücrelerle hizasını kaybeder). Toplam = %100. */
const COLS: { label: string; w: number }[] = [
  { label: 'TESELLÜM MAKBUZ NO', w: 11 },
  { label: 'ADET', w: 5 },
  { label: 'NEVİ', w: 7 },
  { label: 'KİLO', w: 7 },
  { label: 'MALIN CİNSİ', w: 13 },
  { label: 'GÖNDERENİN ADI SOYADI', w: 17 },
  { label: 'ALICININ ADI SOYADI', w: 17 },
  // 173 GT: liste irsaliyesine göndericilerin SEVK İRSALİYESİ eklenmesi zorunlu —
  // eşleştirme anahtarı olarak numarası burada basılır.
  { label: 'SEVK İRS. NO', w: 7 },
  { label: 'TUTARI U/A', w: 8 },
  { label: 'TUTARI P/O', w: 8 },
];

/** Taşıma ücreti özet satırları (tablo içinde basılır, sütun çizgileri kesilmesin diye). */
const FREIGHT_ROWS: { label: string; value: (net: number, vat: number, grand: number) => number }[] = [
  // Etiketler dar sütuna sığacak şekilde kısa (matbu formlardaki gibi)
  { label: 'ARA TOP.', value: (net) => net },
  { label: `KDV %${Math.round(VAT_RATE * 100)}`, value: (_n, vat) => vat },
  { label: 'GEN. TOP.', value: (_n, _v, grand) => grand },
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
  unit: string; // NEVİ (palet/koli/IBC... ya da kalem birimi)
  kind: string; // MALIN CİNSİ
  sender: string; // GÖNDERENİN ADI SOYADI
  recipient: string; // ALICININ ADI SOYADI
  dispatchNote: string; // SEVK İRS. NO (göndericinin irsaliyesi)
};

/** Belgedeki ALICI = FİRMA unvanı (VUK 209 "kime gönderildiği").
 *  Öncelik: durağın alıcı müşterisi → ön ihbardaki alıcı → durak adı (serbest metin duraklar için).
 *  DİKKAT: durağın `name`'i boşaltma NOKTASI adı olabilir ("Gökbil Depo") — o firma değildir,
 *  bu yüzden en sonda, yalnızca firma bilinmiyorsa kullanılır. */
function recipientOf(
  item: { recipientName?: string | null },
  stop: { customerName?: string | null; name: string } | null,
): string {
  return stop?.customerName || item.recipientName || stop?.name || '';
}

/**
 * Sevkiyat defterini (items) belge satırlarına çevirir.
 *  - KAP satırları: durak × kabul × kap tipi → tek satır (ADET = kap sayısı)
 *  - KALEM satırları: durak × kalem → ayrı satır (ADET = miktar, MALIN CİNSİ = ürün adı)
 * Kalem bazlı sevkte artık "Muhtelif" yok — gerçek ürün dökümü basılır.
 * Durak ZORUNLU DEĞİL: durağı olmayan yükte alıcı ön ihbardan gelir.
 */
export function buildWaybillLines(d: Dispatch): WaybillLine[] {
  const out: WaybillLine[] = [];
  const stops = [...(d.stops ?? [])].sort((a, b) => a.seq - b.seq);
  const groups: { stopId: string | null; stop: DispatchStop | null }[] = [
    ...stops.map((s) => ({ stopId: s.id, stop: s })),
    { stopId: null, stop: null }, // durağa atanmamışlar — alıcı ön ihbardan
  ];

  for (const g of groups) {
    const mine = (d.items ?? []).filter((i) => (i.stopId ?? null) === g.stopId);

    // Kap satırları: kabul + kap tipi (+ alıcı) bazında topla
    const byPkg = new Map<
      string,
      { ref: string; sender: string; kind: string; note: string; unit: string; count: number; recipient: string }
    >();
    for (const i of mine.filter((x) => x.kind === 'PACKAGE')) {
      const unit = PACKAGE_TYPE_LABELS[i.unit as PackageType] ?? i.unit;
      const recipient = recipientOf(i, g.stop);
      const key = `${i.receiptId}|${unit}|${recipient}`;
      const cur = byPkg.get(key) ?? {
        ref: i.receiptReference,
        sender: i.customerName ?? '',
        kind: i.description,
        note: i.waybillNo ?? '',
        unit,
        count: 0,
        recipient,
      };
      cur.count += i.qty;
      byPkg.set(key, cur);
    }
    for (const [key, p] of byPkg) {
      out.push({
        key: `${g.stopId ?? 'x'}-p-${key}`,
        receiptRef: p.ref,
        qty: String(p.count),
        unit: p.unit,
        kind: p.kind,
        sender: p.sender,
        recipient: p.recipient,
        dispatchNote: p.note,
      });
    }

    // Kalem satırları: her ürün ayrı satır
    for (const i of mine.filter((x) => x.kind === 'LINE')) {
      out.push({
        key: `${g.stopId ?? 'x'}-l-${i.id}`,
        receiptRef: i.receiptReference,
        qty: String(i.qty),
        unit: i.unit,
        kind: i.description,
        sender: i.customerName ?? '',
        recipient: recipientOf(i, g.stop),
        dispatchNote: i.waybillNo ?? '',
      });
    }
  }
  return out;
}

export function WaybillModal({ dispatch, onClose }: { dispatch: Dispatch; onClose: () => void }) {
  const lines = buildWaybillLines(dispatch);
  // Durak ZORUNLU DEĞİL (alıcı ön ihbardan gelir); yalnızca alıcısı hiç bilinmeyen yük sorundur.
  const noRecipient = lines.filter((l) => !l.recipient.trim()).length;

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
              ℹ Bu sevkiyatta {lines.length} satır var; ilk {WAYBILL_ROWS} satır matbu forma, kalan{' '}
              {lines.length - WAYBILL_ROWS} satır <b>EK LİSTE</b> sayfasına basılır (düz kağıt).
            </div>
          )}
          {noRecipient > 0 && (
            <div>
              ⚠ {noRecipient} satırda ALICI boş (ön ihbarda alıcı seçilmemiş ve durak atanmamış).
              Alıcı yasal zorunlu alandır — durak ekleyin ya da ön ihbarda alıcıyı belirtin.
            </div>
          )}
          {!COMPANY.taxNumber && (
            <div>⚠ Taşıyıcı vergi dairesi/VKN girilmemiş (yasal zorunlu) — company.ts'e ekleyin.</div>
          )}
          <div>
            📎 173 GT: Bu irsaliyeye <b>tesellüm fişi örnekleri</b> ve göndericilerin{' '}
            <b>sevk irsaliyeleri</b> eklenmelidir.
          </div>
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
  // Master (blank) modda satırlar veriden bağımsız — hep WAYBILL_ROWS boş satır.
  // Taşan satırlar EK LİSTE sayfasına gider (173 GT "liste şeklinde irsaliye" yapısı).
  const all = blank ? [] : lines;
  const rows = all.slice(0, WAYBILL_ROWS);
  const annex = all.slice(WAYBILL_ROWS);
  const blanks = Math.max(0, WAYBILL_ROWS - rows.length);
  const totalQty = all.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const docUrl = origin ? `${origin}/sevkiyat/${dispatch.id}` : dispatch.reference;
  const logoUrl = origin ? `${origin}${COMPANY.logoPath}` : COMPANY.logoPath;

  // Taşıma ücreti (VUK zorunlu alan): KDV dahil/hariç ayrımı
  const gross = dispatch.freightAmount ?? 0;
  const vatIncluded = !!dispatch.freightVatIncluded;
  const net = vatIncluded ? gross / (1 + VAT_RATE) : gross;
  const vat = vatIncluded ? gross - net : gross * VAT_RATE;
  const grand = vatIncluded ? gross : gross + vat;

  // Dikey çizgiler arkadaki katmandan gelir → hücrelerde kenarlık YOK (çift çizgi olmasın).
  // Başlık yalnız alt çizgisini korur (başlığı gövdeden ayırır).
  const th = 'border-b border-sky-800 px-1 py-0.5 text-[8px] font-bold uppercase text-sky-800';
  const td = 'px-1 py-1 align-top text-[9px]';
  // Mal satırları SABİT yükseklikte (yükseklik TR düzeyinde): kalan alanı yalnız
  // sondaki dolgu satırı yutsun; aksi halde boş satırlar da esneyip toplam bloğunu ortaya iter.
  const rowH = 'h-[6mm]';

  const plate = dispatch.vehicle?.plate ?? dispatch.vehiclePlate ?? '';
  const trailer = dispatch.vehicle?.trailerPlate ?? '';
  const driver = dispatch.vehicle?.driverName ?? dispatch.driverName ?? '';
  const serial = [dispatch.waybillSerial, dispatch.waybillNo].filter(Boolean).join(' - ');
  // ÇIKIŞ YERİ = yükün alındığı depo (tüm kabuller aynı depodan gelir; ilkini kullan)
  const departure =
    dispatch.items?.[0]?.warehouseName ??
    dispatch.packages[0]?.warehouseName ??
    dispatch.receipts?.[0]?.warehouseName ??
    '';

  return (
    <>
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
      {/* Sütun çizgileri tablodan BAĞIMSIZ bir katmanda: tarayıcının tablo yüksekliği
          dağıtımına güvenmek yerine (satırlar esniyor / tablo kısa kalıyor) çizgiler
          alanın tamamını kaplayan mutlak konumlu katmandan gelir → her zaman aşağı iner. */}
      <div className="relative flex-1">
        <div aria-hidden className="pointer-events-none absolute inset-0 flex">
          {COLS.map((c, i) => (
            <div
              key={c.label}
              style={{ width: `${c.w}%` }}
              className={i < COLS.length - 1 ? 'border-r border-sky-800' : ''}
            />
          ))}
        </div>
        <table className="relative w-full table-fixed border-collapse">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.label} className={th} style={{ width: `${c.w}%` }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.key} className={rowH}>
                <td className={`${td} text-center`}>
                  <span className="slip-data">{l.receiptRef}</span>
                </td>
                <td className={`${td} text-center font-semibold`}>
                  <span className="slip-data">{l.qty}</span>
                </td>
                <td className={td}>
                  <span className="slip-data">{l.unit}</span>
                </td>
                <td className={td} />
                <td className={td}>
                  <span className="slip-data">{l.kind}</span>
                </td>
                <td className={td}>
                  <span className="slip-data">{l.sender}</span>
                </td>
                <td className={td}>
                  <span className="slip-data">{l.recipient}</span>
                </td>
                <td className={`${td} text-center`}>
                  <span className="slip-data">{l.dispatchNote}</span>
                </td>
                <td className={td} />
                <td className={td} />
              </tr>
            ))}
            {Array.from({ length: blanks }).map((_, i) => (
              <tr key={`b${i}`} className={rowH}>
                <td className={td}>&nbsp;</td>
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
            ))}
          </tbody>
        </table>

        {/* Toplamlar sütun alanının EN DİBİNDE: solda TOPLAM adet, sağda taşıma ücreti.
            Çizgi katmanıyla aynı COLS genişliklerini kullanır → sütunlarla birebir hizalı. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end pb-1">
          {COLS.map((c, i) => (
            <div key={c.label} style={{ width: `${c.w}%` }} className="px-1">
              {i === 0 && <span className="text-[8px] font-bold text-slate-700">TOPLAM</span>}
              {i === 1 && (
                <span className="slip-data block text-center text-[9px] font-bold">
                  {totalQty || ' '}
                </span>
              )}
              {i === 8 && (
                <div className="space-y-0.5 text-right text-[8px] font-bold text-slate-700">
                  {FREIGHT_ROWS.map((f) => (
                    <div key={f.label}>{f.label}</div>
                  ))}
                </div>
              )}
              {i === 9 && (
                <div className="space-y-0.5 text-right text-[9px]">
                  {FREIGHT_ROWS.map((f) => (
                    <div key={f.label} className="slip-data">
                      {gross ? formatMoney(f.value(net, vat, grand)) : ' '}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
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

    {/* EK LİSTE — matbu form 8 satırı aşarsa kalanlar düz kağıda basılır.
        173 GT zaten "liste şeklinde" irsaliye öngörüyor; ek, ana belgenin parçasıdır. */}
    {annex.length > 0 && (
      <div className="slip-chrome mt-4 break-before-page border-2 border-sky-800">
        <div className="flex items-start justify-between border-b-2 border-sky-800 p-2">
          <div>
            <h2 className="text-sm font-black tracking-wide text-sky-800">
              TAŞIMA İRSALİYESİ EKİ — YÜK LİSTESİ
            </h2>
            <p className="text-[8px] text-slate-600">
              Bu liste, <span className="slip-data font-semibold">{serial || '—'}</span> seri/sıra
              numaralı taşıma irsaliyesinin ekidir ve onunla birlikte hüküm ifade eder.
            </p>
          </div>
          <div className="w-[45%] space-y-0.5">
            <MetaLine label="SEVKİYAT REF." value={dispatch.reference} labelWidth={92} />
            <MetaLine label="PLAKA NO" value={trailer ? `${plate} / ${trailer}` : plate} labelWidth={92} />
            <MetaLine
              label="TARİH"
              value={formatDate(dispatch.waybillDate ?? dispatch.dispatchedAt ?? dispatch.createdAt)}
              labelWidth={92}
            />
          </div>
        </div>
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.label} className={th} style={{ width: `${c.w}%` }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {annex.map((l, idx) => (
              <tr key={l.key} className={rowH}>
                <td className={`${td} border-x border-sky-800 text-center`}>
                  <span className="slip-data">{l.receiptRef}</span>
                </td>
                <td className={`${td} border-x border-sky-800 text-center font-semibold`}>
                  <span className="slip-data">{l.qty}</span>
                </td>
                <td className={`${td} border-x border-sky-800`}>
                  <span className="slip-data">{l.unit}</span>
                </td>
                <td className={`${td} border-x border-sky-800`} />
                <td className={`${td} border-x border-sky-800`}>
                  <span className="slip-data">{l.kind}</span>
                </td>
                <td className={`${td} border-x border-sky-800`}>
                  <span className="slip-data">{l.sender}</span>
                </td>
                <td className={`${td} border-x border-sky-800`}>
                  <span className="slip-data">{l.recipient}</span>
                </td>
                <td className={`${td} border-x border-sky-800 text-center`}>
                  <span className="slip-data">{l.dispatchNote}</span>
                </td>
                <td className={`${td} border-x border-sky-800`} />
                <td className={`${td} border-x border-sky-800`}>
                  <span className="slip-data text-[7px] text-slate-400">
                    {WAYBILL_ROWS + idx + 1}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t-2 border-sky-800 p-2 text-[8px] text-slate-600">
          Ek listedeki satırlar dâhil <span className="slip-data font-bold">{totalQty}</span> adet /
          kap taşınmaktadır. · {COMPANY.name}
        </div>
      </div>
    )}
    </>
  );
}

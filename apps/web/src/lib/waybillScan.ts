/**
 * İrsaliye fotoğrafının ham okumasından (QR + metin satırları) İrsaliye No /
 * Sipariş No ADAYLARI çıkarır. Saf mantık — DOM/eklenti bağımlılığı yok.
 *
 * İlke (kullanıcı kararı): yapay zekâ ya da sezgi bir numarayı forma KENDİSİ
 * yazmaz. Tek istisna QR: dijital veri, ya birebir okunur ya hiç okunmaz.
 * Metinden çıkan her şey yalnız ADAYDIR; doğruyu depocu dokunarak seçer.
 * Bu yüzden buradaki kurallar "doğruyu bul"dan çok "gürültüyü ele, olasıyı
 * öne al" işi yapar — yanlış bir aday listede kalsa da zararı yok.
 */

export type ScanLine = { text: string; x?: number; y?: number; w?: number; h?: number };

export type WaybillScan = {
  /** QR'dan dijital olarak okunan irsaliye no — güvenilir, doğrudan yazılır. */
  qrWaybillNo: string | null;
  qrOrderNo: string | null;
  /** Metinden İrsaliye No adayları (en olası önce). */
  waybill: string[];
  /** Metinden Sipariş No adayları (en olası önce). */
  order: string[];
};

const MAX_CHIPS = 6;

const TR_FOLD: Record<string, string> = { İ: 'I', Ş: 'S', Ğ: 'G', Ü: 'U', Ö: 'O', Ç: 'C' };

/** Etiket eşleştirmesi için: Türkçe büyük harf + aksansız ("İrsaliye" → "IRSALIYE"). */
export function fold(s: string): string {
  return s.toLocaleUpperCase('tr-TR').replace(/[İŞĞÜÖÇ]/g, (c) => TR_FOLD[c]);
}

// ---------------------------------------------------------------------------
// e-Belge numarası (GİB): 3 karakter önek + 4 hane yıl + 9 hane sıra = 16 karakter
// örn. ATZ2026000006278. Yapısı sabit olduğu için en güçlü işarettir.
// ---------------------------------------------------------------------------

/** Rakam olması GEREKEN yerde OCR'ın sık karıştırdığı harfler. */
const DIGIT_FIX: Record<string, string> = {
  O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', S: '5', B: '8', Z: '2', G: '6',
};

/**
 * Metin e-belge numarasına benziyorsa düzeltilmiş hâlini döner. Yalnız rakam
 * olması gereken 13 hanede harf→rakam düzeltmesi yapılır; önek olduğu gibi kalır.
 * Önekte en az bir harf şartı: 16 haneli saf sayılar (MERSİS vb.) karışmasın.
 */
export function asEBelgeNo(raw: string, now: Date = new Date()): string | null {
  const t = fold(raw).replace(/[\s.:\-_]/g, '');
  if (t.length !== 16) return null;
  const prefix = t.slice(0, 3);
  if (!/^[A-Z0-9]{3}$/.test(prefix) || !/[A-Z]/.test(prefix)) return null;
  const rest = [...t.slice(3)].map((c) => DIGIT_FIX[c] ?? c).join('');
  if (!/^\d{13}$/.test(rest)) return null;
  const year = Number(rest.slice(0, 4));
  const y = now.getFullYear();
  if (year < y - 3 || year > y + 1) return null;
  return prefix + rest;
}

/** Düzeltme GEREKMEDEN e-belge biçiminde mi? (QR'ı doğrudan yazmak için) */
function isStrictEBelge(s: string, now: Date): boolean {
  return /^[A-Z0-9]{3}\d{13}$/.test(s) && asEBelgeNo(s, now) === s;
}

// ---------------------------------------------------------------------------
// Etiketler (fold edilmiş metin üzerinde)
// ---------------------------------------------------------------------------

// Matbu irsaliyede "Seri: A  No: 004512" — SERİ ile NO arası kısa olabilir
const WAYBILL_LABEL =
  /IRSALIYE(?:SI)?\s*(?:NO|NUMARASI|NUMARA|NR)\b|\bIRS\.?\s*NO\b|\bBELGE\s*NO\b|\bSIRA\s*NO\b|\bSERI\b.{0,12}?\bNO\b/;
const ORDER_LABEL =
  /SIPARIS\s*(?:NO|NUMARASI|NUMARA|NR)\b|\bSIP\.?\s*NO\b|\bP\.?\s*O\.?\s*(?:NO|NUMBER)\b|\bORDER\s*(?:NO|NUMBER)\b/;

/** Bu satırlardaki sayılar irsaliye/sipariş no OLAMAZ (vergi, telefon, adres, ETTN...). */
const NOISE_LINE =
  /\b(?:VKN|TCKN|VERGI|KIMLIK|MERSIS|SICIL|ETTN|UUID|IBAN|TEL|TELEFON|FAX|FAKS|GSM|CEP|E-?POSTA|WWW|HTTP|MAH|MAHALLE|CAD|CADDE|SOK|SOKAK|BULVAR|BLV|APT|POSTA)\b|@/;

/** Sayıyı parçalara ayırmayan, kelimeleri ayıran karakterler. */
function tokens(text: string): string[] {
  return text.split(/[\s:;,|=()[\]]+/).filter(Boolean);
}

/** Token'ı alan değerine çevirir: ASCII büyük harf, uçtaki noktalama atılır. */
function clean(tok: string): string {
  return fold(tok)
    .replace(/[^A-Z0-9\-/]/g, '')
    .replace(/^[-/]+|[-/]+$/g, '');
}

/** Token bir irsaliye/sipariş numarası olabilir mi? (ham token üzerinden eleme) */
function plausible(raw: string): string | null {
  // Tarih / saat / tutar / ondalık: "12.05.2026", "14:30", "1.250,50"
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(raw)) return null;
  if (/^\d{1,2}[:.]\d{2}(?:[:.]\d{2})?$/.test(raw)) return null;
  if (/\d[.,]\d/.test(raw)) return null;

  const c = clean(raw);
  if (c.length < 4 || c.length > 24) return null;
  const digits = (c.match(/\d/g) ?? []).length;
  if (digits < 4) return null;
  // ETTN/UUID parçaları: çok tireli hex
  if ((c.match(/-/g) ?? []).length >= 2 && /^[0-9A-F-]+$/.test(c) && /[A-F]/.test(c)) return null;
  if (/^[0-9A-F]{20,}$/.test(c) && /[A-F]/.test(c)) return null;
  // Telefon, IBAN
  if (/^0\d{10}$/.test(c) || /^90\d{10}$/.test(c)) return null;
  if (/^TR\d{24}$/.test(c)) return null;
  return c;
}

/** Metindeki ilk olası değer (e-belge biçimindeyse OCR karışıklıkları düzeltilmiş). */
function firstValue(text: string): string | null {
  for (const t of tokens(text)) {
    const v = plausible(t);
    if (v) return asEBelgeNo(v) ?? v;
  }
  return null;
}

/** Etiketin AYNI satırda sağındaki değer ("İrsaliye No: ABC123"). */
function valueAfterLabel(folded: string, label: RegExp): string | null {
  const m = label.exec(folded);
  if (!m) return null;
  return firstValue(folded.slice(m.index + m[0].length));
}

type Box = Required<ScanLine>;
const hasBox = (l: ScanLine): l is Box =>
  l.x !== undefined && l.y !== undefined && l.w !== undefined && l.h !== undefined;

/**
 * Etiket ile değer ayrı satır olarak okunduysa (tablo hücreleri): önce aynı
 * hizada SAĞDAKİ, yoksa hemen ALTTAKİ satıra bakılır.
 */
function neighborValue(lines: ScanLine[], i: number): string | null {
  const L = lines[i];
  if (!hasBox(L)) return null;
  const midY = L.y + L.h / 2;

  const right = lines
    .filter((R, j): R is Box => j !== i && hasBox(R))
    .filter(
      (R) =>
        R.x >= L.x + L.w * 0.6 &&
        Math.abs(R.y + R.h / 2 - midY) <= Math.max(L.h, R.h) * 0.6,
    )
    .sort((a, b) => a.x - b.x)
    .slice(0, 2);
  for (const R of right) {
    const v = firstValue(fold(R.text));
    if (v) return v;
  }

  const below = lines
    .filter((R, j): R is Box => j !== i && hasBox(R))
    .filter(
      (R) =>
        R.y > L.y + L.h * 0.5 &&
        R.y - (L.y + L.h) <= L.h * 2.5 &&
        R.x < L.x + L.w &&
        R.x + R.w > L.x,
    )
    .sort((a, b) => a.y - b.y)
    .slice(0, 2);
  for (const R of below) {
    const v = firstValue(fold(R.text));
    if (v) return v;
  }
  return null;
}

// ---------------------------------------------------------------------------
// QR
// ---------------------------------------------------------------------------

type QrRead = { waybillNo: string | null; orderNo: string | null; loose: string[] };

/**
 * e-İrsaliye görselindeki GİB karekodu JSON taşır ({"vkntckn":..,"no":..,"ettn":..}).
 * `no` alanı resmî belge numarasıdır. Fatura karekodu da aynı yapıda olduğu için
 * "FATURA" geçen kod doğrudan yazılmaz, yalnız aday olur.
 */
function readQr(raw: string, now: Date): QrRead {
  const out: QrRead = { waybillNo: null, orderNo: null, loose: [] };
  const isInvoice = /FATURA|INVOICE/.test(fold(raw));

  let obj: unknown = null;
  try {
    obj = JSON.parse(raw.trim());
  } catch {
    /* JSON değil — düz metin / URL */
  }

  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const entries = Object.entries(obj as Record<string, unknown>).map(
      ([k, v]) => [k.toLowerCase().replace(/[^a-z]/g, ''), v] as const,
    );
    const pick = (names: string[]) => {
      for (const [k, v] of entries) {
        if (names.includes(k) && (typeof v === 'string' || typeof v === 'number')) {
          const s = clean(String(v));
          if (s) return s;
        }
      }
      return null;
    };
    const no = pick(['no', 'irsaliyeno', 'belgeno', 'documentno', 'despatchno']);
    const order = pick(['siparisno', 'orderno']);
    const official = entries.some(([k]) => ['ettn', 'vkntckn', 'avkntckn', 'uuid'].includes(k));
    if (no) {
      if (!isInvoice && (official || isStrictEBelge(no, now))) out.waybillNo = no;
      else out.loose.push(no);
    }
    if (order) out.orderNo = order;
    return out;
  }

  // Düz metin / URL içinde e-belge numarası
  const m = /(?:^|[^A-Z0-9])([A-Z0-9]{3}\d{13})(?![A-Z0-9])/.exec(fold(raw));
  if (m && isStrictEBelge(m[1], now)) {
    if (isInvoice) out.loose.push(m[1]);
    else out.waybillNo = m[1];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Birleştirme
// ---------------------------------------------------------------------------

function uniq(list: (string | null | undefined)[], exclude: Set<string> = new Set()): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    if (!v || seen.has(v) || exclude.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function analyzeWaybill(
  barcodes: string[],
  lines: ScanLine[],
  now: Date = new Date(),
): WaybillScan {
  // --- QR: ilk anlamlı okuma kazanır ---
  let qrWaybillNo: string | null = null;
  let qrOrderNo: string | null = null;
  const qrLoose: string[] = [];
  for (const raw of barcodes) {
    const r = readQr(raw, now);
    qrWaybillNo ??= r.waybillNo;
    qrOrderNo ??= r.orderNo;
    qrLoose.push(...r.loose);
  }

  // --- Metin ---
  const labelWaybill: string[] = [];
  const labelOrder: string[] = [];
  const ebelge: string[] = [];
  const generic: { v: string; y: number }[] = [];

  lines.forEach((line, i) => {
    const f = fold(line.text);

    // e-belge biçimi gürültü satırında bile aranır (tablo hücresi "ETTN" yanında olabilir)
    for (const t of tokens(f)) {
      const e = asEBelgeNo(t, now);
      if (e) ebelge.push(e);
    }
    // Boşlukla bölünmüş okuma: "ATZ 2026 000006278"
    const joined = /[A-Z0-9]{3}\s\d{4}\s?[0-9OQDILSBZG]{9}|[A-Z0-9]{3}\d{4}\s[0-9OQDILSBZG]{9}/.exec(f);
    if (joined) {
      const e = asEBelgeNo(joined[0], now);
      if (e) ebelge.push(e);
    }

    if (ORDER_LABEL.test(f)) {
      labelOrder.push(valueAfterLabel(f, ORDER_LABEL) ?? neighborValue(lines, i) ?? '');
      return;
    }
    if (WAYBILL_LABEL.test(f)) {
      labelWaybill.push(valueAfterLabel(f, WAYBILL_LABEL) ?? neighborValue(lines, i) ?? '');
      return;
    }
    if (NOISE_LINE.test(f)) return;

    for (const t of tokens(f)) {
      const v = plausible(t);
      if (!v) continue;
      // Saf sayı ise en az 6 hane: posta kodu (34000) ve miktarlar karışmasın
      if (/^\d+$/.test(v) && v.length < 6) continue;
      // e-belge biçimindekiler zaten düzeltilmiş hâliyle yukarıda toplandı
      if (asEBelgeNo(v, now)) continue;
      generic.push({ v, y: line.y ?? i });
    }
  });

  // Genel adaylar sayfada yukarıdan aşağı: numaralar başlıkta, kalem kodları altta
  const genericSorted = generic.sort((a, b) => a.y - b.y).map((g) => g.v);

  const orderSet = new Set(uniq(labelOrder));
  const waybillStrong = uniq([qrWaybillNo, ...qrLoose, ...labelWaybill, ...ebelge], orderSet);
  const waybill = uniq([...waybillStrong, ...genericSorted], orderSet).slice(0, MAX_CHIPS);
  const order = uniq(
    [qrOrderNo, ...labelOrder, ...genericSorted],
    new Set(waybillStrong),
  ).slice(0, MAX_CHIPS);

  return { qrWaybillNo, qrOrderNo, waybill, order };
}

/**
 * Türk telefon numarasını otomatik biçimlendirir: "0XXX XXX XX XX" (11 hane, 4-3-2-2).
 * Örn: "5399531089" -> "0539 953 10 89", "02163944833" -> "0216 394 48 33".
 *
 * - Baştaki 0 zorunlu: kullanıcı 0'sız yazarsa (ya da yapıştırırsa) otomatik eklenir.
 * - "+90 / 0090 / 90" ülke kodu ile yapıştırılırsa temizlenir.
 * - Alan tamamen silinebilsin diye boş girdi boş döner (0 eklenmez).
 */
export function formatPhone(raw: string): string {
  let s = (raw ?? '').replace(/\D/g, '');
  if (!s) return ''; // temizlenebilsin

  // Ülke kodu: 0090XXXXXXXXXX / 90XXXXXXXXXX (+90 zaten yukarıda '90'a indi)
  if (s.startsWith('0090')) s = s.slice(4);
  else if (s.startsWith('90') && s.length > 10) s = s.slice(2);

  if (!s.startsWith('0')) s = '0' + s; // baştaki sıfır her zaman olsun
  s = s.slice(0, 11);

  return [s.slice(0, 4), s.slice(4, 7), s.slice(7, 9), s.slice(9, 11)].filter(Boolean).join(' ');
}

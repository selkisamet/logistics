/**
 * Türk plakasını otomatik biçimlendirir: büyük harf + standart boşluklama.
 * İl kodu (2 hane) + harf grubu (1-3) + rakam grubu (1-5).
 * Örn: "34gty70" -> "34 GTY 70", "34l3393" -> "34 L 3393", "34fbc243" -> "34 FBC 243".
 */
export function formatPlate(raw: string): string {
  const s = (raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  const m = /^(\d{0,2})([A-Z]{0,3})(\d{0,5})$/.exec(s);
  if (!m) return s; // beklenmeyen sıralama: en azından büyük harf + boşluksuz
  return [m[1], m[2], m[3]].filter(Boolean).join(' ');
}

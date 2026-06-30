import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // okunması kolay (0/O, 1/I yok)

/** Karışıklığa düşmeyen rastgele kod parçası üretir. */
export function randomCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Tarih ön ekli okunur referans: PREFIX-YYYYMMDD-XXXX */
export function datedReference(prefix: string): string {
  const now = new Date();
  const ymd =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  return `${prefix}-${ymd}-${randomCode(4)}`;
}

// Bulgarian formatting, written by hand so it looks the same on every phone.
import { toDayNumber } from '../engine/budgetEngine';

const MON = ['ян.', 'февр.', 'март', 'апр.', 'май', 'юни', 'юли', 'авг.', 'септ.', 'окт.', 'ноем.', 'дек.'];
const WD = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const grp = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** 123456 → "1 234,56 €" */
export function eur(cents: number, decimals = true): string {
  const neg = cents < 0;
  const a = Math.abs(Math.round(cents));
  const body = decimals ? `${grp(Math.floor(a / 100))},${String(a % 100).padStart(2, '0')}` : grp(Math.round(a / 100));
  return `${neg ? '−' : ''}${body} €`;
}
export const eur0 = (cents: number) => eur(cents, false);

/** "2026-10-29" → "29 окт." */
export function dLabel(d: string): string {
  const [, m, dd] = d.split('-').map(Number);
  return `${dd} ${MON[m - 1]}`;
}
/** "2026-10-29" → "чт, 29 окт." */
export function dwLabel(d: string): string {
  const wd = new Date(toDayNumber(d) * 86_400_000).getUTCDay();
  return `${WD[wd]}, ${dLabel(d)}`;
}
export const days = (n: number) => `${n} ${n === 1 ? 'ден' : 'дни'}`;

/** Local calendar date of a JS Date as "YYYY-MM-DD". */
export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** "YYYY-MM-DD" → JS Date at local noon (safe from DST edges). */
export function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

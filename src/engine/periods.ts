// Names for date ranges in the History tab. Pay periods rarely match calendar months
// (e.g. 23 Oct – 24 Nov), so a range is named after the month(s) it mostly covers.

export const MONTHS_BG = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];

type YM = { y: number; m: number }; // m = 1..12
const parse = (d: string) => { const [y, m, day] = d.split('-').map(Number); return { y, m, day }; };
const shift = ({ y, m }: YM, k: number): YM => { const i = y * 12 + (m - 1) + k; return { y: Math.floor(i / 12), m: (i % 12) + 1 }; };
const same = (a: YM, b: YM) => a.y === b.y && a.m === b.m;

/**
 * "2026-10-23" … "2026-11-24" → "Ноември 2026"
 * "2026-07-24" … "2026-10-22" → "Август – Октомври 2026"
 * "2026-01-01" … "2026-12-31" → "2026"
 * A start late in a month (20th or later) counts for the next month; an end early in a
 * month (10th or earlier) counts for the previous one. Ranges of up to 15 days take the month of their middle day.
 */
export function periodName(start: string, end: string): string {
  const s = parse(start), e = parse(end);
  if (s.m === 1 && s.day === 1 && e.m === 12 && e.day === 31 && s.y === e.y) return String(s.y);
  const days = Math.round((Date.UTC(e.y, e.m - 1, e.day) - Date.UTC(s.y, s.m - 1, s.day)) / 86_400_000) + 1;
  if (days <= 15) { // a short range: the month of its middle day
    const mid = new Date(Date.UTC(s.y, s.m - 1, s.day) + Math.floor((days - 1) / 2) * 86_400_000);
    return `${MONTHS_BG[mid.getUTCMonth()]} ${mid.getUTCFullYear()}`;
  }
  const first = s.day >= 20 ? shift(s, 1) : { y: s.y, m: s.m };
  let last = e.day <= 10 ? shift(e, -1) : { y: e.y, m: e.m };
  if (last.y * 12 + last.m < first.y * 12 + first.m) last = first;
  if (same(first, last)) return `${MONTHS_BG[first.m - 1]} ${first.y}`;
  if (first.y === last.y) return `${MONTHS_BG[first.m - 1]} – ${MONTHS_BG[last.m - 1]} ${last.y}`;
  return `${MONTHS_BG[first.m - 1]} ${first.y} – ${MONTHS_BG[last.m - 1]} ${last.y}`;
}

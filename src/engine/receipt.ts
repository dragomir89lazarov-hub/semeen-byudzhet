// Turns what the AI read from a receipt/screenshot into clean expense lines in euro cents.
// Pure functions, tested in receipt.test.ts.

export const BGN_PER_EUR = 1.95583; // fixed conversion rate of the Bulgarian lev

export interface RawReceiptItem { name?: string; amount?: number | string; category_id?: string; new_category?: string }
export interface RawReceipt { store?: string; date?: string; currency?: string; total?: number | string; items?: RawReceiptItem[] }

export interface ReceiptLine {
  key: string;
  name: string;
  amountCents: number;          // > 0
  categoryId: string | null;    // one of the household's categories
  newCategory: string | null;   // AI's suggestion when nothing fits (created only if the user approves)
}
export interface Receipt { store: string; date: string | null; totalCents: number | null; lines: ReceiptLine[] }

/** "2,49" | "2.49" | 2.49 | "1 234,50 лв." → 2.49 / 1234.5 (NaN if unreadable) */
export function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  let s = v.replace(/[^\d,.\-]/g, '');
  s = s.replace(/^[.,]+|[.,]+$/g, ''); // e.g. the dot of "лв."
  if (!/\d/.test(s)) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return Number(s);
}

const toCents = (amount: number, currency: string) =>
  Math.round((currency === 'BGN' ? amount / BGN_PER_EUR : amount) * 100);

/** Accepts "2026-10-29" or "29.10.2026"; returns null for anything else or for impossible dates. */
export function normalizeDate(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Clean up the AI's answer:
 *  - converts лв. to € if the receipt was in BGN,
 *  - spreads negative lines (whole-receipt discounts) over the other lines in proportion,
 *    so every saved expense is positive and the lines still add up to what was paid,
 *  - keeps only category ids that really exist; otherwise keeps the suggested new name.
 */
export function normalizeReceipt(raw: RawReceipt, categoryIds: string[]): Receipt {
  const currency = String(raw.currency || 'EUR').toUpperCase().includes('BGN') || /лв/i.test(String(raw.currency || '')) ? 'BGN' : 'EUR';
  const valid = new Set(categoryIds);
  const parsed = (raw.items || [])
    .map((it, i) => ({ i, name: String(it.name || '').trim() || 'Продукт', cents: toCents(toNumber(it.amount), currency), it }))
    .filter(x => Number.isFinite(x.cents) && x.cents !== 0);
  const positives = parsed.filter(x => x.cents > 0);
  const discount = -parsed.filter(x => x.cents < 0).reduce((a, x) => a + x.cents, 0);
  const gross = positives.reduce((a, x) => a + x.cents, 0);

  // Largest-remainder split of the discount, so the cents add up exactly.
  let lines = positives.map(x => ({ ...x, share: gross ? (discount * x.cents) / gross : 0 }));
  const floorSum = lines.reduce((a, x) => a + Math.floor(x.share), 0);
  let leftover = Math.min(discount, gross) - floorSum;
  const order = [...lines].sort((a, b) => (b.share % 1) - (a.share % 1));
  const extra = new Map<number, number>();
  for (const x of order) { if (leftover <= 0) break; extra.set(x.i, 1); leftover--; }
  lines = lines.map(x => ({ ...x, cents: x.cents - Math.floor(x.share) - (extra.get(x.i) || 0) }));

  const total = toNumber(raw.total);
  return {
    store: String(raw.store || '').trim(),
    date: normalizeDate(raw.date),
    totalCents: Number.isFinite(total) && total > 0 ? toCents(total, currency) : null,
    lines: lines.filter(x => x.cents > 0).map(x => {
      const cat = x.it.category_id && valid.has(x.it.category_id) ? x.it.category_id : null;
      const suggestion = String(x.it.new_category || '').trim();
      return { key: `r${x.i}`, name: x.name, amountCents: x.cents, categoryId: cat, newCategory: cat ? null : suggestion || null };
    }),
  };
}

export const sumLines = (lines: { amountCents: number }[]) => lines.reduce((a, l) => a + l.amountCents, 0);

/** One expense per category, with the product names joined into the note. */
export function groupByCategory(lines: ReceiptLine[]): { categoryKey: string; amountCents: number; names: string[] }[] {
  const out = new Map<string, { categoryKey: string; amountCents: number; names: string[] }>();
  for (const l of lines) {
    const k = l.categoryId || `new:${l.newCategory || ''}`;
    const g = out.get(k) || { categoryKey: k, amountCents: 0, names: [] };
    g.amountCents += l.amountCents; g.names.push(l.name); out.set(k, g);
  }
  return [...out.values()];
}

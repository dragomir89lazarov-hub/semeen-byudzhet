// Sends the sample receipt to Gemini with the same prompt as the app and checks the result.
// Run in GitHub Actions: GEMINI_API_KEY=... node --experimental-strip-types scripts/test-receipt.ts
import { readFileSync } from 'node:fs';
import { readReceipt } from '../supabase/functions/read-receipt/gemini.ts';
import { normalizeReceipt, sumLines } from '../src/engine/receipt.ts';

const categories = [
  { id: 'groceries', name: 'Хранителни продукти' }, { id: 'takeaway', name: 'Храна за вкъщи и ресторанти' },
  { id: 'clothes', name: 'Дрехи' }, { id: 'bills', name: 'Сметки и комунални услуги' },
  { id: 'kids', name: 'Детски нужди' }, { id: 'fun', name: 'Развлечения' }, { id: 'car', name: 'Кола' },
];
const image = readFileSync(new URL('./fixtures/receipt-lidl.jpg', import.meta.url)).toString('base64');
process.on('uncaughtException', e => { console.log(`::error title=Скриптът спря::${String((e as Error)?.stack || e).replace(/\n/g, ' ').slice(0, 900)}`); process.exit(1); });
process.on('unhandledRejection', e => { console.log(`::error title=Скриптът спря::${String((e as Error)?.stack || e).replace(/\n/g, ' ').slice(0, 900)}`); process.exit(1); });
// Try each model on its own and report status + time, so we know which ones work right now.
for (const m of (process.env.GEMINI_TRY || '').split(',').map(x => x.trim()).filter(Boolean)) {
  const t0 = Date.now();
  const x = await readReceipt({ apiKey: process.env.GEMINI_API_KEY || '', model: m, only: true, timeoutMs: 120_000, image, mimeType: 'image/jpeg', categories, today: '2026-10-29' });
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(x.ok ? `::notice title=✓ ${m} ${sec}s::${x.data.items.length} реда, ${x.data.store}` : `::notice title=✗ ${m} ${sec}s::${x.error} ${(x.detail || '').replace(/\n/g, ' ').slice(0, 300)}`);
}
const r = await readReceipt({ apiKey: process.env.GEMINI_API_KEY || '', model: process.env.GEMINI_MODEL, image, mimeType: 'image/jpeg', categories, today: '2026-10-29' });
if (!r.ok) { console.log(`::error title=Gemini ${r.error}::${(r.detail || '').replace(/\n/g, ' ').slice(0, 800)}`); process.exit(1); }
const rec = normalizeReceipt(r.data, categories.map(c => c.id));
const name = (id: string | null) => categories.find(c => c.id === id)?.name || '—';
const lines = rec.lines.map(l => `${l.name} ${(l.amountCents / 100).toFixed(2)} → ${l.categoryId ? name(l.categoryId) : '+' + l.newCategory}`).join(' | ');
console.log(`::notice title=Gemini (${r.model}) – ${rec.store} ${rec.date}::${lines}`);
console.log(`::notice title=Сума::редове ${(sumLines(rec.lines) / 100).toFixed(2)} / бележка ${rec.totalCents === null ? '—' : (rec.totalCents / 100).toFixed(2)}`);
if (rec.lines.length < 6 || rec.totalCents !== 1374 || Math.abs(sumLines(rec.lines) - 1374) > 2) { console.log('::error title=Неточно разчитане::Сумата или броят редове не съвпадат.'); process.exit(1); }

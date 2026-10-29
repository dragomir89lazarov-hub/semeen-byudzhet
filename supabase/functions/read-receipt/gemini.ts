// Reads a receipt photo or an online-order screenshot with Google Gemini and returns
// the product lines with a suggested category for each. Plain TypeScript with fetch only,
// so it runs both in the Supabase Edge Function (Deno) and in the Node test script.

export interface CategoryHint { id: string; name: string }

export interface RawReceipt {
  store?: string;
  date?: string;
  currency?: string;
  total?: number | string;
  items: { name: string; amount: number | string; category_id?: string; new_category?: string }[];
}

export type ReadResult =
  | { ok: true; data: RawReceipt; model: string }
  | { ok: false; error: 'limit' | 'not_configured' | 'unreadable' | 'failed'; detail?: string };

// 'gemini-flash-latest' follows Google's newest Flash model; the others are fallbacks when it's busy or retired.
const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.5-flash'];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function buildPrompt(categories: CategoryHint[], today: string): string {
  return [
    'You read shopping receipts and screenshots of online orders, usually from Bulgaria (Cyrillic text).',
    'List every purchased product line with the final amount actually paid for that line:',
    'quantity × unit price, minus any discount printed for that line.',
    'Do NOT list totals, subtotals, VAT (ДДС) lines, payment method lines, change (ресто), loyalty points, or card numbers.',
    'A discount that applies to the whole receipt goes in as its own line with a NEGATIVE amount, named "Отстъпка".',
    'Delivery or packaging fees are their own lines ("Доставка", "Опаковка").',
    'Amounts are plain decimal numbers in the receipt currency. Since 2026 Bulgaria uses euro;',
    'if both EUR and BGN (лв.) are printed, use the EUR amounts and set currency "EUR"; if only лв. is shown, set currency "BGN".',
    'Keep product names short and in the original language; expand obvious abbreviations (e.g. "КИСЕЛ.МЛЯКО" → "Кисело мляко").',
    'For each line choose the best category_id from this list of the family\'s categories:',
    JSON.stringify(categories.map(c => ({ id: c.id, name: c.name }))),
    'Food and drinks for home are groceries; ready meals from restaurants or delivery apps are takeaway.',
    'If none of the categories fits, leave category_id empty and put a short Bulgarian category name in new_category (e.g. "Аптека", "Домакинство").',
    `Give the purchase date as YYYY-MM-DD if it is visible (today is ${today}); give the store or website name; give the printed grand total.`,
    'If the image is not a receipt or order, return an empty items list.',
  ].join('\n');
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    store: { type: 'STRING' },
    date: { type: 'STRING' },
    currency: { type: 'STRING' },
    total: { type: 'NUMBER' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          category_id: { type: 'STRING' },
          new_category: { type: 'STRING' },
        },
        required: ['name', 'amount'],
      },
    },
  },
  required: ['items'],
};

export async function readReceipt(o: {
  apiKey: string; model?: string | null; image: string; mimeType: string; categories: CategoryHint[]; today: string;
}): Promise<ReadResult> {
  if (!o.apiKey) return { ok: false, error: 'not_configured' };
  const models = [o.model, ...DEFAULT_MODELS].filter((m, i, a): m is string => !!m && a.indexOf(m) === i);
  let lastDetail = '';
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        signal: AbortSignal.timeout(45_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': o.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: o.mimeType || 'image/jpeg', data: o.image } }, { text: buildPrompt(o.categories, o.today) }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
        }),
        });
      } catch (e) {                                                                            // dropped connection or timeout: like "busy"
        lastDetail = `${model}: ${String((e as Error)?.message || e)}`;
        if (attempt === 0) await sleep(1500);
        continue;
      }
      if (res.status === 404) { lastDetail = `${model}: not found`; break; }                  // retired: next model
      if (res.status === 503 || res.status === 500) {                                          // busy: retry once, then next model
        lastDetail = `${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
        if (attempt === 0) await sleep(1500);
        continue;
      }
      if (res.status === 429) return { ok: false, error: 'limit', detail: (await res.text()).slice(0, 300) };
      if (!res.ok) return { ok: false, error: 'failed', detail: `${model} ${res.status}: ${(await res.text()).slice(0, 400)}` };
      const body = await res.json();
      const text: string = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
      try {
        const data = JSON.parse(text) as RawReceipt;
        if (!Array.isArray(data.items)) data.items = [];
        return { ok: true, data, model };
      } catch {
        return { ok: false, error: 'unreadable', detail: text.slice(0, 300) };
      }
    }
  }
  return { ok: false, error: 'failed', detail: lastDetail || 'no model available' };
}

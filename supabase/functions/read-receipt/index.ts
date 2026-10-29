// Supabase Edge Function: POST { image: base64, mimeType, categories: [{id,name}] }
// → { store, date, currency, total, items: [...] } or { error }.
// Only signed-in members of a household may call it; the Gemini key never leaves Supabase.
import { readReceipt } from './gemini.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // Who is calling? PostgREST validates the user's token and row-level security
  // returns their household membership (empty for strangers).
  const auth = req.headers.get('authorization') || '';
  const apikey = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const who = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/household_members?select=household_id&limit=1`, {
    headers: { authorization: auth, apikey },
  });
  if (!who.ok) return json({ error: 'unauthorized' }, 401);
  const rows = await who.json();
  if (!Array.isArray(rows) || rows.length === 0) return json({ error: 'forbidden' }, 403);

  let body: { image?: string; mimeType?: string; categories?: { id: string; name: string }[]; today?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (!body.image || body.image.length > 8_000_000) return json({ error: 'bad_image' }, 400);

  const result = await readReceipt({
    apiKey: Deno.env.get('GEMINI_API_KEY') || '',
    model: Deno.env.get('GEMINI_MODEL'),
    image: body.image,
    mimeType: body.mimeType || 'image/jpeg',
    categories: (body.categories || []).slice(0, 60),
    today: body.today || new Date().toISOString().slice(0, 10),
  });
  if (!result.ok) return json({ error: result.error, detail: result.detail }, result.error === 'limit' ? 429 : 502);
  return json({ ...result.data, model: result.model });
});

// Take a photo / pick an image → shrink it → send it to the Supabase function that asks Gemini → clean result.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { normalizeReceipt, type Receipt } from '../engine/receipt';
import { supabase } from './supabase';

export type ReadOutcome = { ok: true; receipt: Receipt } | { ok: false; message: string } | { ok: false; cancelled: true };

const MAX_WIDTH = 1600; // enough for small receipt print; keeps uploads around 200–500 KB

export async function pickImage(source: 'camera' | 'gallery'): Promise<{ uri: string; width: number } | { error: string } | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { error: 'Няма разрешение за камерата. Разрешете го от настройките на телефона.' };
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    return r.canceled || !r.assets?.length ? null : { uri: r.assets[0].uri, width: r.assets[0].width };
  }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  return r.canceled || !r.assets?.length ? null : { uri: r.assets[0].uri, width: r.assets[0].width };
}

async function toJpegBase64(uri: string, width: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  return out.base64 || '';
}

export async function readReceiptImage(
  source: 'camera' | 'gallery',
  categories: { id: string; name: string }[],
  today: string,
  onStage?: (stage: 'reading') => void,
): Promise<ReadOutcome> {
  const picked = await pickImage(source);
  if (!picked) return { ok: false, cancelled: true };
  if ('error' in picked) return { ok: false, message: picked.error };
  onStage?.('reading');
  let image: string;
  try { image = await toJpegBase64(picked.uri, picked.width); } catch { return { ok: false, message: 'Снимката не можа да бъде обработена.' }; }

  const { data, error } = await supabase.functions.invoke('read-receipt', {
    body: { image, mimeType: 'image/jpeg', categories, today },
  });
  if (error) {
    let code = '';
    try { code = (await (error as { context?: Response }).context?.json())?.error || ''; } catch { }
    if (code === 'limit') return { ok: false, message: 'Безплатният лимит на Gemini за днес е изчерпан. Опитайте утре сутрин или въведете разхода ръчно.' };
    if (code === 'forbidden' || code === 'unauthorized') return { ok: false, message: 'Нямате достъп до разчитането. Влезте отново в профила си.' };
    if (/network|fetch/i.test(String(error.message))) return { ok: false, message: 'Няма връзка с интернет.' };
    return { ok: false, message: 'Разчитането не успя. Опитайте отново с по-ясна снимка.' };
  }
  const receipt = normalizeReceipt(data, categories.map(c => c.id));
  if (!receipt.lines.length) return { ok: false, message: 'Не открих продукти на снимката. Опитайте с по-ясна снимка на бележката или поръчката.' };
  return { ok: true, receipt };
}

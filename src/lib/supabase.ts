import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { SUPABASE_KEY, SUPABASE_URL } from '../config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the sign-in token only while the app is in the foreground.
AppState.addEventListener('change', state => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** True when a Supabase error means "couldn't reach the server" rather than "the server refused". */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { message?: string; code?: string; status?: number };
  const msg = (e.message || String(error)).toLowerCase();
  if (e.code && /^[0-9A-Z]{5}$/.test(e.code)) return false; // a Postgres error code: the server answered
  return /network|fetch|timeout|timed out|offline|failed to connect|abort/.test(msg) || e.status === 0;
}

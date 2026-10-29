// Shared household data: loads from Supabase, caches on the phone, applies changes instantly,
// queues writes while offline, and listens for the partner's changes in real time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isNetworkError, supabase } from '../lib/supabase';
import type {
  BudgetRow, BucketRow, CategoryRow, CycleRow, HouseholdRow, Model, SaveResult, TableKey, Tables, Tx, TxRow,
} from './types';
import { TABLE } from './types';
import type { PaydayRule } from '../engine/budgetEngine';
import { cycleAroundToday } from './derive';

type Status = 'loading' | 'nohousehold' | 'ready' | 'error';
interface Op { key: string; kind: 'upsert' | 'update'; table: string; row: Record<string, unknown>; id?: string; onConflict?: string }

const EMPTY: Tables = { cycles: [], categories: [], budgets: [], buckets: [], txs: [] };
const BOOKKEEPING = ['version', 'updated_at', 'created_at'];
const strip = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([k]) => !BOOKKEEPING.includes(k)));
const rowKey = (key: TableKey, r: any) => (key === 'budgets' ? `${r.cycle_id}:${r.category_id}` : r.id);
export const uuid = () => Crypto.randomUUID();

function mergeRows<T>(key: TableKey, list: T[], row: any, force = false): T[] {
  const k = rowKey(key, row);
  const i = list.findIndex(r => rowKey(key, r) === k);
  if (i === -1) return [...list, row];
  const old: any = list[i];
  if (!force && typeof old.version === 'number' && typeof row.version === 'number' && row.version < old.version) return list;
  const next = list.slice(); next[i] = { ...old, ...row }; return next;
}

function toModel(h: HouseholdRow | null, t: Tables): Model {
  const budgets: Record<string, Record<string, number>> = {};
  for (const b of t.budgets) (budgets[b.cycle_id] ||= {})[b.category_id] = Number(b.planned_cents);
  return {
    settings: {
      people: h?.people?.length ? h.people : ['Аз', 'Партньор'],
      payday: h?.payday_rule || { type: 'monthly_day', day: 25, weekend: 'previous_business_day' },
      bufferCents: Number(h?.buffer_cents || 0),
      defaultFund: h?.default_fund_id || null,
      inviteCode: h?.invite_code || '',
    },
    cycles: t.cycles.map(c => ({ id: c.id, start: c.start_date, end: c.end_date, carryoverCents: Number(c.carryover_cents || 0), budgets: budgets[c.id] || {} })),
    categories: t.categories.map(c => ({ id: c.id, name: c.name, color: c.color, fixed: c.is_fixed, archived: c.is_archived, order: c.sort_order, group: c.group_name?.trim() || null })),
    buckets: t.buckets.map(b => ({ id: b.id, name: b.name, kind: b.kind, color: b.color, targetCents: b.target_cents == null ? null : Number(b.target_cents), targetDate: b.target_date, archived: b.is_archived, order: b.sort_order })),
    txs: t.txs.filter(x => !x.deleted_at).map(rowToTx),
  };
}
export const rowToTx = (x: TxRow): Tx => ({
  id: x.id, kind: x.kind, amountCents: Number(x.amount_cents), occurredOn: x.occurred_on, categoryId: x.category_id,
  bucketId: x.bucket_id, paidBy: x.paid_by, note: x.note || '', loggedBy: x.logged_by, createdAt: x.created_at || '', version: x.version,
});

async function fetchAll<T>(table: string, hid: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').eq('household_id', hid).range(from, from + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export interface TxInput {
  id?: string; kind: Tx['kind']; amountCents: number; occurredOn: string; categoryId: string | null;
  bucketId: string | null; paidBy: string | null; note: string;
}

interface Store {
  status: Status; userId: string; householdId: string | null; model: Model; pending: number; lastError: string | null;
  refresh(): Promise<void>;
  retry(): void;
  createHousehold(people: string[], firstCycle: { start: string; end: string }): Promise<string | null>;
  joinHousehold(code: string): Promise<string | null>;
  saveTx(input: TxInput, base?: { version: number; force?: boolean }): Promise<SaveResult>;
  deleteTx(id: string): Promise<void>;
  addCategory(name: string, fixed: boolean): Promise<string>;
  setCategoryFixed(id: string, fixed: boolean): Promise<void>;
  updateCategory(id: string, patch: { name?: string; archived?: boolean; group?: string | null }): Promise<void>;
  renameGroup(from: string, to: string | null): Promise<void>;
  addBucket(name: string, targetCents: number | null): Promise<void>;
  updateBucket(id: string, patch: { name?: string; targetCents?: number | null; archived?: boolean }): Promise<void>;
  resetAll(): Promise<boolean>;
  updateSettings(patch: { people?: string[]; bufferCents?: number; payday?: PaydayRule; defaultFund?: string }): Promise<void>;
  saveCycle(c: { id?: string; start: string; end: string; carryoverCents?: number }): Promise<string>;
  saveBudgets(cycleId: string, budgets: Record<string, number>): Promise<void>;
  signOut(): Promise<void>;
}
const Ctx = createContext<Store | null>(null);
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error('StoreProvider missing'); return s; };

export function StoreProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [hid, setHid] = useState<string | null>(null);
  const [household, setHousehold] = useState<HouseholdRow | null>(null);
  const [tables, setTables] = useState<Tables>(EMPTY);
  const [pending, setPending] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const outbox = useRef<Op[]>([]);
  const flushing = useRef(false);
  const hidRef = useRef<string | null>(null);
  const householdRef = useRef<HouseholdRow | null>(null);
  householdRef.current = household;
  const tablesRef = useRef<Tables>(EMPTY);
  tablesRef.current = tables;

  const merge = useCallback((key: TableKey, row: any, force = false) => {
    setTables(t => ({ ...t, [key]: mergeRows(key, t[key] as any[], row, force) }));
  }, []);

  // ── outbox ───────────────────────────────────────────────────────────
  const saveOutbox = async () => { setPending(outbox.current.length); try { await AsyncStorage.setItem(`outbox:${userId}`, JSON.stringify(outbox.current)); } catch { } };
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (outbox.current.length) {
        const op = outbox.current[0];
        const q = op.kind === 'update'
          ? supabase.from(op.table).update(op.row).eq('id', op.id!)
          : supabase.from(op.table).upsert(op.row, op.onConflict ? { onConflict: op.onConflict } : undefined);
        const { error } = await q;
        if (error && isNetworkError(error)) break;            // offline: try again later
        if (error) setLastError(humanError(error.message));  // refused: drop it so the queue doesn't jam
        else setLastError(null);
        outbox.current.shift();
        await saveOutbox();
      }
    } catch { /* network threw: keep the queue */ } finally { flushing.current = false; setPending(outbox.current.length); }
  }, [userId]);

  const enqueue = async (op: Omit<Op, 'key'>) => {
    outbox.current.push({ ...op, key: uuid() });
    await saveOutbox();
    flush();
  };
  const put = async (key: TableKey, row: Record<string, unknown>, onConflict?: string) => {
    const existing: any = (tablesRef.current[key] as any[]).find(r => rowKey(key, r) === rowKey(key, row));
    merge(key, { ...existing, ...row, version: (existing?.version ?? 0) + 1, updated_at: new Date().toISOString() }, true);
    await enqueue({ kind: 'upsert', table: TABLE[key], row: strip(row), onConflict });
  };

  // ── loading ──────────────────────────────────────────────────────────
  const loadFromServer = useCallback(async (h: string) => {
    const [hh, cycles, categories, budgets, buckets, txs] = await Promise.all([
      supabase.from('households').select('*').eq('id', h).maybeSingle(),
      fetchAll<CycleRow>('pay_cycles', h), fetchAll<CategoryRow>('categories', h), fetchAll<BudgetRow>('cycle_budgets', h),
      fetchAll<BucketRow>('buckets', h), fetchAll<TxRow>('transactions', h),
    ]);
    if (hh.error) throw hh.error;
    setHousehold(hh.data as HouseholdRow);
    // keep local edits that haven't reached the server yet
    const queued = outbox.current.filter(o => o.kind === 'upsert');
    let t: Tables = { cycles, categories, budgets, buckets, txs };
    for (const o of queued) {
      const key = (Object.keys(TABLE) as TableKey[]).find(k => TABLE[k] === o.table);
      if (key) t = { ...t, [key]: mergeRows(key, t[key] as any[], o.row, true) };
    }
    setTables(t);
  }, []);

  const start = useCallback(async (h: string) => {
    hidRef.current = h; setHid(h);
    try { await AsyncStorage.setItem(`hid:${userId}`, h); } catch { }
    try {
      const cached = await AsyncStorage.getItem(`cache:${h}`);
      if (cached) { const c = JSON.parse(cached); setHousehold(c.household); setTables({ ...EMPTY, ...c.tables }); setStatus('ready'); }
    } catch { }
    try { await loadFromServer(h); setStatus('ready'); } catch (e) { if (!isNetworkError(e)) setLastError(humanError((e as Error).message)); }
    setStatus(s => (s === 'loading' ? 'ready' : s));
  }, [userId, loadFromServer]);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const raw = await AsyncStorage.getItem(`outbox:${userId}`); outbox.current = raw ? JSON.parse(raw) : []; setPending(outbox.current.length); } catch { }
      let h: string | null = null;
      try { h = await AsyncStorage.getItem(`hid:${userId}`); } catch { }
      let failure: string | null = null;
      try {
        const res = await Promise.race([
          supabase.from('household_members').select('household_id').eq('user_id', userId).limit(1),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout: сървърът не отговаря')), 15000)),
        ]);
        if (res.error) failure = describe(res.error);
        else h = res.data?.[0]?.household_id ?? null;
      } catch (e) { failure = describe(e); }
      if (cancelled) return;
      if (h) { start(h); return; }
      if (failure) { setLastError(failure); setStatus('error'); return; }
      setLastError(null); setStatus('nohousehold');
    })();
    return () => { cancelled = true; };
  }, [userId, start, attempt]);

  // cache to the phone so the app opens instantly and works offline
  useEffect(() => {
    if (!hid || status !== 'ready') return;
    const t = setTimeout(() => { AsyncStorage.setItem(`cache:${hid}`, JSON.stringify({ household, tables })).catch(() => { }); }, 800);
    return () => clearTimeout(t);
  }, [hid, status, household, tables]);

  // live updates from the other phone
  useEffect(() => {
    if (!hid) return;
    const ch = supabase.channel(`household-${hid}`);
    (Object.keys(TABLE) as TableKey[]).forEach(key => {
      ch.on('postgres_changes' as any, { event: '*', schema: 'public', table: TABLE[key], filter: `household_id=eq.${hid}` },
        (p: any) => { if (p.new && Object.keys(p.new).length) merge(key, p.new); });
    });
    ch.on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'households', filter: `id=eq.${hid}` },
      (p: any) => {
        // the other phone pressed "Изчисти всички данни": drop pending writes and reload everything
        if (p.new?.reset_at && p.new.reset_at !== householdRef.current?.reset_at) {
          outbox.current = []; saveOutbox();
          setTables(EMPTY);
          loadFromServer(hid).catch(() => { });
        }
        setHousehold(old => (!old || p.new.version >= old.version ? { ...old, ...p.new } : old));
      });
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [hid, merge]);

  // retry queued writes and catch up whenever the app comes back to the foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && hidRef.current) { flush(); loadFromServer(hidRef.current).catch(() => { }); }
    });
    const timer = setInterval(() => { if (outbox.current.length) flush(); }, 15000);
    return () => { sub.remove(); clearInterval(timer); };
  }, [flush, loadFromServer]);

  const model = useMemo(() => toModel(household, tables), [household, tables]);

  // ── actions ──────────────────────────────────────────────────────────
  const store: Store = {
    status, userId, householdId: hid, model, pending, lastError,
    retry: () => { setStatus('loading'); setAttempt(a => a + 1); },
    refresh: async () => { if (hidRef.current) { await flush(); await loadFromServer(hidRef.current); } },

    async createHousehold(people, firstCycle) {
      const { data, error } = await supabase.rpc('create_household', { p_people: people });
      if (error) { setLastError(humanError(error.message)); return null; }
      const h = data as string;
      const { error: e2 } = await supabase.from('pay_cycles').insert({ household_id: h, start_date: firstCycle.start, end_date: firstCycle.end });
      if (e2) setLastError(humanError(e2.message));
      await start(h);
      return h;
    },
    async joinHousehold(code) {
      const { data, error } = await supabase.rpc('join_household', { p_code: code });
      if (error) { setLastError(/invalid_code/.test(error.message) ? 'Невалиден код. Проверете го и опитайте отново.' : humanError(error.message)); return null; }
      setLastError(null);
      await start(data as string);
      return data as string;
    },

    async saveTx(input, base) {
      const h = hidRef.current!;
      const id = input.id || uuid();
      const row = {
        id, household_id: h, kind: input.kind, amount_cents: input.amountCents, occurred_on: input.occurredOn,
        category_id: input.categoryId, bucket_id: input.bucketId, paid_by: input.paidBy, note: input.note, deleted_at: null,
      };
      if (!input.id) {
        await put('txs', { ...row, logged_by: userId, created_at: new Date().toISOString() });
        return { ok: true };
      }
      // Editing: check nobody changed it on the other phone in the meantime.
      if (base && !base.force && outbox.current.length === 0) {
        try {
          const { data, error } = await supabase.from('transactions').update(row).eq('id', id).eq('version', base.version).select();
          if (!error) {
            if (data && data.length) { merge('txs', data[0], true); return { ok: true }; }
            const cur = await supabase.from('transactions').select('*').eq('id', id).maybeSingle();
            if (cur.data) {
              merge('txs', cur.data, true);
              if (cur.data.deleted_at) return { error: 'Този запис беше изтрит на другия телефон.' };
              return { conflict: rowToTx(cur.data as TxRow) };
            }
            return { error: 'Този запис беше изтрит на другия телефон.' };
          }
          if (!isNetworkError(error)) return { error: humanError(error.message) };
        } catch { /* offline: fall through to the queue */ }
      }
      await put('txs', row);
      return { ok: true };
    },
    async deleteTx(id) {
      const existing = tablesRef.current.txs.find(t => t.id === id);
      if (!existing) return;
      await put('txs', { ...strip(existing as any), deleted_at: new Date().toISOString() });
    },
    async addCategory(name, fixed) {
      const old = tablesRef.current.categories.find(c => c.is_archived && c.name.toLowerCase() === name.toLowerCase());
      if (old) { await put('categories', { ...strip(old as any), is_archived: false }); return old.id; }
      const id = uuid();
      const order = Math.max(-1, ...tablesRef.current.categories.map(c => c.sort_order)) + 1;
      await put('categories', { id, household_id: hidRef.current, name, is_fixed: fixed, color: order % 8, sort_order: order, is_archived: false });
      return id;
    },
    async setCategoryFixed(id, fixed) {
      const c = tablesRef.current.categories.find(x => x.id === id); if (!c) return;
      await put('categories', { ...strip(c as any), is_fixed: fixed });
    },
    async updateCategory(id, patch) {
      const c = tablesRef.current.categories.find(x => x.id === id); if (!c) return;
      await put('categories', { ...strip(c as any), ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.archived !== undefined ? { is_archived: patch.archived } : {}),
        ...(patch.group !== undefined ? { group_name: patch.group } : {}) });
    },
    async renameGroup(from, to) {
      for (const c of tablesRef.current.categories.filter(x => (x.group_name || '').trim() === from)) {
        await put('categories', { ...strip(c as any), group_name: to });
      }
    },
    async updateBucket(id, patch) {
      const b = tablesRef.current.buckets.find(x => x.id === id); if (!b) return;
      await put('buckets', { ...strip(b as any), ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.targetCents !== undefined ? { target_cents: patch.targetCents } : {}), ...(patch.archived !== undefined ? { is_archived: patch.archived } : {}) });
      if (patch.archived && householdRef.current?.default_fund_id === id) {
        const pool = tablesRef.current.buckets.find(x => x.kind === 'pool');
        if (pool) await store.updateSettings({ defaultFund: pool.id });
      }
    },
    async resetAll() {
      const h = hidRef.current; if (!h) return false;
      const { error } = await supabase.rpc('reset_household');
      if (error) { setLastError(humanError(error.message)); return false; }
      outbox.current = []; await saveOutbox();
      setTables(EMPTY);
      try { await AsyncStorage.removeItem(`cache:${h}`); } catch { }
      await loadFromServer(h);
      const rule = householdRef.current?.payday_rule || { type: 'monthly_day', day: 25, weekend: 'previous_business_day' };
      const c = cycleAroundToday(rule as PaydayRule);
      const { error: e2 } = await supabase.from('pay_cycles').insert({ household_id: h, start_date: c.start, end_date: c.end });
      if (e2) setLastError(humanError(e2.message));
      await loadFromServer(h);
      return true;
    },
    async addBucket(name, targetCents) {
      const old = tablesRef.current.buckets.find(b => b.is_archived && b.name.toLowerCase() === name.toLowerCase());
      if (old) { await put('buckets', { ...strip(old as any), is_archived: false, target_cents: targetCents }); return; }
      const order = Math.max(-1, ...tablesRef.current.buckets.map(b => b.sort_order)) + 1;
      await put('buckets', { id: uuid(), household_id: hidRef.current, name, kind: 'savings', target_cents: targetCents, color: (order + 4) % 8, sort_order: order, is_archived: false });
    },
    async updateSettings(patch) {
      const h = hidRef.current; if (!h) return;
      const row: Record<string, unknown> = {};
      if (patch.people) row.people = patch.people;
      if (patch.bufferCents !== undefined) row.buffer_cents = patch.bufferCents;
      if (patch.payday) row.payday_rule = patch.payday;
      if (patch.defaultFund) row.default_fund_id = patch.defaultFund;
      setHousehold(old => (old ? { ...old, ...row, version: old.version + 1 } as HouseholdRow : old));
      await enqueue({ kind: 'update', table: 'households', id: h, row });
    },
    async saveCycle(c) {
      const id = c.id || uuid();
      const existing = tablesRef.current.cycles.find(x => x.id === id);
      await put('cycles', { ...(existing ? strip(existing as any) : {}), id, household_id: hidRef.current, start_date: c.start, end_date: c.end,
        ...(c.carryoverCents !== undefined ? { carryover_cents: c.carryoverCents } : {}) });
      return id;
    },
    async saveBudgets(cycleId, budgets) {
      const h = hidRef.current;
      const ids = new Set([...Object.keys(budgets), ...tablesRef.current.budgets.filter(b => b.cycle_id === cycleId).map(b => b.category_id)]);
      for (const categoryId of ids) {
        await put('budgets', { household_id: h, cycle_id: cycleId, category_id: categoryId, planned_cents: budgets[categoryId] || 0 }, 'cycle_id,category_id');
      }
    },
    async signOut() {
      await supabase.auth.signOut();
    },
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function humanError(msg: string): string {
  if (/exclusion constraint|conflicting key/i.test(msg)) return 'Периодът се застъпва с друг период.';
  if (/duplicate key.*name|unique/i.test(msg)) return 'Вече има запис с това име.';
  if (/row-level security|permission/i.test(msg)) return 'Нямате права за тази промяна.';
  return 'Неуспешно записване: ' + msg;
}

/** Full error text for the error screen, so problems can be diagnosed from a screenshot. */
function describe(e: unknown): string {
  const x = e as { message?: string; code?: string; details?: string; hint?: string };
  return [x?.code, x?.message || String(e), x?.details, x?.hint].filter(Boolean).join(' · ');
}

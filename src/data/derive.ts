// Pure helpers that turn the model into what the screens show. All money math goes through the tested engine.
import * as Engine from '../engine/budgetEngine';
import { TIME_ZONE } from '../config';
import type { Bucket, Category, Cycle, Model, Tx } from './types';

export function today(): string {
  try { return Engine.todayIn(TIME_ZONE); } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

export const toEngineTx = (t: Tx): Engine.Tx => ({ id: t.id, kind: t.kind, amountCents: t.amountCents, occurredOn: t.occurredOn, categoryId: t.categoryId, bucketId: t.bucketId });
export const inCycle = (t: Tx, c: Cycle) => t.occurredOn >= c.start && t.occurredOn <= c.end;
export const sortedCycles = (m: Model) => [...m.cycles].sort((a, b) => (a.start < b.start ? -1 : 1));
export const activeCats = (m: Model): Category[] => m.categories.filter(c => !c.archived).sort((a, b) => a.order - b.order);
export const activeBuckets = (m: Model): Bucket[] => m.buckets.filter(b => !b.archived).sort((a, b) => a.order - b.order);
export const poolOf = (m: Model): Bucket => m.buckets.find(b => b.kind === 'pool') || { id: 'pool', name: 'Заплати (общ бюджет)', kind: 'pool', color: 0, targetCents: null, targetDate: null, archived: false, order: -1 };
export const savingsOf = (m: Model) => activeBuckets(m).filter(b => b.kind !== 'pool');
export const defaultFundId = (m: Model) => {
  const id = m.settings.defaultFund;
  return id && savingsOf(m).some(b => b.id === id) ? id : poolOf(m).id;
};
export const isPoolId = (m: Model, id: string | null) => !id || id === poolOf(m).id;
export const catOf = (m: Model, id: string | null) => m.categories.find(c => c.id === id);
export const bucketOf = (m: Model, id: string | null) => m.buckets.find(b => b.id === id);
export const txSort = (a: Tx, b: Tx) => (a.occurredOn === b.occurredOn ? (b.createdAt > a.createdAt ? 1 : -1) : a.occurredOn < b.occurredOn ? 1 : -1);

export function currentCycle(m: Model): Cycle | null {
  const t = today(); const cs = sortedCycles(m);
  return cs.find(c => c.start <= t && t <= c.end) || [...cs].reverse().find(c => c.start <= t) || cs[0] || null;
}

function allowanceInput(m: Model, c: Cycle, day?: string): Engine.AllowanceInput {
  return {
    cycle: { id: c.id, startDate: c.start, endDate: c.end, openingCarryoverCents: c.carryoverCents },
    transactions: m.txs.filter(t => inCycle(t, c)).map(toEngineTx),
    categories: m.categories.map(x => ({ id: x.id, isFixed: x.fixed })),
    budgetLines: Object.entries(c.budgets).map(([categoryId, plannedCents]) => ({ categoryId, plannedCents })),
    today: day || today(),
    bufferCents: m.settings.bufferCents,
  };
}
export const computePool = (m: Model, c: Cycle, day?: string) => Engine.computeAllowance(allowanceInput(m, c, day));
export const velocity = (m: Model, c: Cycle) => Engine.velocitySeries(allowanceInput(m, c));
export const computeFund = (m: Model, bucketId: string, c: Cycle) =>
  Engine.computeBucketAllowance({ bucketId, transactions: m.txs.map(toEngineTx), cycle: { startDate: c.start, endDate: c.end }, today: today() });
export const bucketBalance = (m: Model, bucketId: string) => Engine.bucketBalance(bucketId, m.txs.map(toEngineTx));

export function spentByCat(m: Model, c: Cycle): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of m.txs) if (t.kind === 'expense' && !t.bucketId && inCycle(t, c)) out[t.categoryId!] = (out[t.categoryId!] || 0) + t.amountCents;
  return out;
}

/** Find the pay cycle that contains today from the payday rule (used when the household is first created). */
export function cycleAroundToday(rule: Engine.PaydayRule): { start: string; end: string } {
  const t = today();
  if (rule.type !== 'monthly_day') return { start: t, end: Engine.addDays(t, 29) };
  let p = Engine.nextPayday(Engine.addDays(t, -45), rule); let prev = p;
  while (p <= t) { prev = p; p = Engine.nextPayday(p, rule); }
  return { start: prev <= t ? prev : t, end: Engine.addDays(p, -1) };
}

export function cycleError(msg: string | null): string | null {
  if (!msg) return null;
  if (/^End/.test(msg)) return 'Крайната дата е преди началната.';
  if (/62/.test(msg)) return 'Период над 62 дни вероятно е грешка.';
  return 'Застъпва се с друг период.';
}

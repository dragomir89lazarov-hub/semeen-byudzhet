import type { PaydayRule, TxKind } from '../engine/budgetEngine';

// ── Rows exactly as they live in Supabase ──────────────────────────────
export interface HouseholdRow {
  id: string; name: string; payday_rule: PaydayRule; people: string[]; buffer_cents: number;
  default_fund_id: string | null; invite_code: string; version: number; updated_at?: string; reset_at?: string | null;
}
export interface CycleRow { id: string; household_id: string; start_date: string; end_date: string; carryover_cents: number; version: number; updated_at?: string }
export interface CategoryRow { id: string; household_id: string; name: string; color: number; is_fixed: boolean; is_archived: boolean; sort_order: number; group_name?: string | null; version: number; updated_at?: string }
export interface BudgetRow { household_id: string; cycle_id: string; category_id: string; planned_cents: number; version: number; updated_at?: string }
export interface BucketRow {
  id: string; household_id: string; name: string; kind: 'pool' | 'savings'; color: number; target_cents: number | null;
  target_date: string | null; is_archived: boolean; sort_order: number; version: number; updated_at?: string;
}
export interface TxRow {
  id: string; household_id: string; kind: TxKind; amount_cents: number; occurred_on: string;
  category_id: string | null; bucket_id: string | null; paid_by: string | null; note: string;
  logged_by: string | null; created_at?: string; updated_at?: string; version: number; deleted_at: string | null;
}

export interface Tables {
  cycles: CycleRow[];
  categories: CategoryRow[];
  budgets: BudgetRow[];
  buckets: BucketRow[];
  txs: TxRow[];
}
export type TableKey = keyof Tables;

export const TABLE: Record<TableKey, string> = {
  cycles: 'pay_cycles', categories: 'categories', budgets: 'cycle_budgets', buckets: 'buckets', txs: 'transactions',
};

// ── Shapes the screens work with ───────────────────────────────────────
export interface Settings { people: string[]; payday: PaydayRule; bufferCents: number; defaultFund: string | null; inviteCode: string }
export interface Cycle { id: string; start: string; end: string; carryoverCents: number; budgets: Record<string, number> }
export interface Category { id: string; name: string; color: number; fixed: boolean; archived: boolean; order: number; group: string | null }
export interface Bucket { id: string; name: string; kind: 'pool' | 'savings'; color: number; targetCents: number | null; targetDate: string | null; archived: boolean; order: number }
export interface Tx {
  id: string; kind: TxKind; amountCents: number; occurredOn: string; categoryId: string | null; bucketId: string | null;
  paidBy: string | null; note: string; loggedBy: string | null; createdAt: string; version: number;
}
export interface Model { settings: Settings; cycles: Cycle[]; categories: Category[]; buckets: Bucket[]; txs: Tx[] }

export type SaveResult = { ok: true } | { conflict: Tx } | { error: string };

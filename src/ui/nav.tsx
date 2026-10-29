import React, { createContext, useContext } from 'react';
import { Pressable, Text, View } from 'react-native';
import { bucketOf, catOf } from '../data/derive';
import type { Model, Tx } from '../data/types';
import { dLabel, eur } from '../lib/format';
import { catColor, useTheme } from '../lib/theme';
import { NUM } from './kit';

export type Tab = 'today' | 'buckets' | 'history' | 'setup';
export interface SheetInit {
  mode?: 'expense' | 'income' | 'transfer'; editId?: string; source?: string | null; bucketId?: string | null; direction?: 'to_bucket' | 'from_bucket';
}
export interface Nav {
  tab: Tab; setTab(t: Tab): void; sub: string | null; setSub(s: string | null): void;
  txFilter: string; setTxFilter(f: string): void; openSheet(init: SheetInit): void;
  metric: 'today' | 'period' | 'avg'; setMetric(m: 'today' | 'period' | 'avg'): void;
}
export const NavCtx = createContext<Nav | null>(null);
export const useNav = () => { const n = useContext(NavCtx); if (!n) throw new Error('NavCtx missing'); return n; };

export function txMeta(m: Model, t: Tx, colors: string[]) {
  const c = (i: number | undefined) => colors[(((i ?? 0) % 8) + 8) % 8];
  if (t.kind === 'income') return { title: 'Приход' + (t.paidBy ? ' · ' + t.paidBy : ''), color: '', mark: '+', sign: '+', income: true, from: '' };
  if (t.kind === 'bucket_deposit') { const b = bucketOf(m, t.bucketId); return { title: 'Към ' + (b?.name || 'фонд'), color: c(b?.color), mark: '→', sign: '', income: false, from: '' }; }
  if (t.kind === 'bucket_withdrawal') { const b = bucketOf(m, t.bucketId); return { title: 'От ' + (b?.name || 'фонд'), color: c(b?.color), mark: '←', sign: '+', income: true, from: '' }; }
  const k = catOf(m, t.categoryId); const b = t.bucketId ? bucketOf(m, t.bucketId) : null;
  return { title: k?.name || 'Разход', color: c(k?.color), mark: (k?.name || '?').slice(0, 2), sign: '−', income: false, from: b ? 'от ' + b.name : '' };
}

export function TxRow({ m, tx, onPress, first }: { m: Model; tx: Tx; onPress?: () => void; first?: boolean }) {
  const t = useTheme();
  const meta = txMeta(m, tx, t.cats);
  const sub = [tx.note, tx.kind === 'expense' ? tx.paidBy : '', meta.from, dLabel(tx.occurredOn)].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: t.line, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: meta.income && tx.kind === 'income' ? t.good : meta.color || catColor(t, 0) }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{meta.mark}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: t.ink, fontWeight: '500', fontSize: 15 }}>{meta.title}</Text>
        <Text numberOfLines={1} style={{ color: t.ink2, fontSize: 12.5 }}>{sub}</Text>
      </View>
      <Text style={[{ color: meta.income ? t.good : t.ink, fontWeight: '700', fontSize: 15 }, NUM]}>{meta.sign}{eur(tx.amountCents)}</Text>
    </Pressable>
  );
}

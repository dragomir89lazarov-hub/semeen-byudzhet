// "Къде отидоха парите": four ways to look at spending by category over a date range
// (the current pay period on Today, any filter in History). Only spending from the salaries
// fund counts: payments from savings funds don't touch the daily limit.
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import * as Engine from '../engine/budgetEngine';
import { computePool, statItems, statKeyOf, today } from '../data/derive';
import type { Cycle, Model } from '../data/types';
import { dLabel, eur0 } from '../lib/format';
import { catColor, useTheme } from '../lib/theme';
import { Donut } from './charts';
import { NUM, T } from './kit';
import { GroupToggle, useNav } from './nav';

type View4 = 'share' | 'line' | 'bubbles' | 'daily';
const LABELS: [View4, string][] = [['share', 'Дялове'], ['line', 'Линии'], ['bubbles', 'Кръгове'], ['daily', 'По дни']];

export type Span = { start: string; end: string };

export default function SpendingViews({ m, from, to, cycle, onCategory }: {
  m: Model; from: string; to: string; cycle?: Cycle | null; onCategory?: (categoryId: string) => void;
}) {
  const t = useTheme(); const nav = useNav();
  const [view, setView] = useState<View4>('share');
  const span: Span = { start: from, end: to };
  const items = statItems(m, nav.grouped);
  const spent: Record<string, number> = {};
  for (const x of m.txs) if (x.kind === 'expense' && !x.bucketId && x.occurredOn >= from && x.occurredOn <= to) {
    const k = statKeyOf(m, x.categoryId, nav.grouped); spent[k] = (spent[k] || 0) + x.amountCents;
  }
  const budgets = cycle?.budgets || {};
  // archived categories only show up when they have spending in this period
  const rows = items
    .filter(it => (spent[it.key] || 0) > 0 || it.ids.some(id => !m.categories.find(k => k.id === id)?.archived))
    .map(it => ({ k: { id: it.key, name: it.name }, ids: it.ids, v: spent[it.key] || 0, plan: it.ids.reduce((a, id) => a + (budgets[id] || 0), 0), color: catColor(t, it.color), isGroup: it.isGroup }));
  const total = rows.reduce((a, r) => a + r.v, 0);

  return (
    <View style={{ gap: 12 }}>
      <GroupToggle m={m} />
      <View style={{ flexDirection: 'row', backgroundColor: t.sunk, borderRadius: 12, padding: 3, gap: 3 }}>
        {LABELS.map(([k, l]) => (
          <Pressable key={k} onPress={() => setView(k)} accessibilityState={{ selected: view === k }}
            style={{ flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center', backgroundColor: view === k ? t.surface : 'transparent' }}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: '700', fontSize: 13, color: view === k ? t.ink : t.ink2 }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {view === 'share' ? (
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Donut t={t} total={total} parts={rows.map(r => ({ color: r.color, value: r.v }))} />
          <View style={{ flex: 1, gap: 8 }}>
            {rows.map(({ k, v, plan, color, isGroup }) => (
              <Pressable key={k.id} onPress={() => { if (onCategory && !k.id.startsWith('g:')) onCategory(k.id); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
                <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 13.5, fontWeight: isGroup ? '700' : '400' }}>{k.name}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[{ color: plan && v > plan ? t.bad : t.ink, fontSize: 13.5 }, NUM]}>{eur0(v)}</Text>
                  {plan ? <Text style={[{ color: t.ink2, fontSize: 11.5 }, NUM]}>от {eur0(plan)}</Text> : null}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : view === 'line' ? <Lines m={m} span={span} rows={rows} /> : view === 'bubbles' ? <Bubbles rows={rows} total={total} /> : <Daily m={m} span={span} rows={rows} />}
    </View>
  );
}

type Row = { k: { id: string; name: string }; ids: string[]; v: number; color: string };

/** Cumulative spending per category, day by day through today. */
function Lines({ m, span: c, rows }: { m: Model; span: Span; rows: Row[] }) {
  const t = useTheme();
  const totalDays = Engine.daysInclusive(c.start, c.end);
  const lastDay = Math.max(0, Math.min(Engine.daysInclusive(c.start, today()), totalDays));
  const shown = rows.filter(r => r.v > 0);
  const W = 340, H = 180, L = 8, R = 8, T0 = 14, B = 24;
  const series = shown.map(r => {
    let cum = 0; const pts: number[] = [];
    for (let i = 0; i < lastDay; i++) {
      const d = Engine.addDays(c.start, i);
      cum += m.txs.filter(x => x.kind === 'expense' && !x.bucketId && !!x.categoryId && r.ids.includes(x.categoryId) && x.occurredOn === d).reduce((a, x) => a + x.amountCents, 0);
      pts.push(cum);
    }
    return { r, pts };
  });
  const maxY = Math.max(1, ...series.map(s => s.pts[s.pts.length - 1] || 0)) * 1.1;
  const X = (i: number) => L + (i / Math.max(1, totalDays - 1)) * (W - L - R);
  const Y = (v: number) => T0 + (1 - v / maxY) * (H - T0 - B);
  if (!shown.length) return <T muted small>Още няма разходи в този период.</T>;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ aspectRatio: W / H, width: '100%' }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          {[0.33, 0.66].map(f => <Line key={f} x1={L} x2={W - R} y1={Y(maxY * f / 1.1)} y2={Y(maxY * f / 1.1)} stroke={t.line} strokeDasharray="2 4" />)}
          <Line x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} stroke={t.line} />
          {series.map(s => <Polyline key={s.r.k.id} points={s.pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')} fill="none" stroke={s.r.color} strokeWidth={2.2} strokeLinejoin="round" />)}
          <SvgText x={L} y={H - 6} fontSize={11} fill={t.ink2}>{dLabel(c.start)}</SvgText>
          <SvgText x={W - R} y={H - 6} textAnchor="end" fontSize={11} fill={t.ink2}>{dLabel(c.end)}</SvgText>
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {shown.map(r => (
          <View key={r.k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: r.color }} />
            <Text style={[{ color: t.ink, fontSize: 12.5 }, NUM]}>{r.k.name} {eur0(r.v)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Circles sized by amount (area ∝ euro), with the amount written inside. */
function Bubbles({ rows, total }: { rows: Row[]; total: number }) {
  const shown = rows.filter(r => r.v > 0).sort((a, b) => b.v - a.v);
  if (!shown.length) return <T muted small>Още няма разходи в този период.</T>;
  const max = shown[0].v;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
      {shown.map(r => {
        const d = Math.max(64, Math.round(150 * Math.sqrt(r.v / max)));
        return (
          <View key={r.k.id} style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: r.color, alignItems: 'center', justifyContent: 'center', padding: 6 }}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={[{ color: '#fff', fontWeight: '800', fontSize: d > 100 ? 18 : 14 }, NUM]}>{eur0(r.v)}</Text>
            <Text numberOfLines={2} style={{ color: '#fff', fontSize: 10.5, textAlign: 'center' }}>{r.k.name}</Text>
            <Text style={[{ color: '#fff', fontSize: 10, opacity: 0.85 }, NUM]}>{Math.round((r.v / total) * 100)}%</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * One column per day from the start of the period to today, stacked by category (or group).
 * The dashed line is that day's limit (remaining at midnight ÷ days left), so it can step
 * up or down from day to day; days above their limit get a red date.
 */
function Daily({ m, span: c, rows }: { m: Model; span: Span; rows: Row[] }) {
  const t = useTheme();
  const td = today();
  const totalDays = Engine.daysInclusive(c.start, c.end);
  const n = Math.max(0, Math.min(totalDays, Engine.daysInclusive(c.start, td < c.end ? td : c.end)));
  if (!n) return <T muted small>Избраните дати са в бъдещето.</T>;
  const dayList = Array.from({ length: n }, (_, i) => Engine.addDays(c.start, i));
  const owner = new Map<string, number>();                       // category id → row index
  rows.forEach((r, i) => r.ids.forEach(id => owner.set(id, i)));
  const perDay = dayList.map(d => {
    const v = rows.map(() => 0);
    for (const x of m.txs) if (x.kind === 'expense' && !x.bucketId && x.occurredOn === d && x.categoryId) {
      const i = owner.get(x.categoryId); if (i !== undefined) v[i] += x.amountCents;
    }
    return v;
  });
  const totals = perDay.map(v => v.reduce((a, b) => a + b, 0));
  // each day's limit comes from the pay period that day belongs to (none if it's outside every period)
  const limits = dayList.map(d => { const cy = m.cycles.find(x => x.start <= d && d <= x.end); return cy ? computePool(m, cy, d).dailyAllowanceCents : null; });
  const over = totals.map((v, i) => limits[i] !== null && v > (limits[i] as number));
  const maxY = Math.max(1, ...totals, ...limits.map(v => v || 0)) * 1.12;
  const W = 340, H = 196, L = 34, R = 6, T0 = 10, B = n <= 10 ? 30 : 18;
  const slot = (W - L - R) / n, gap = n <= 10 ? 6 : n <= 20 ? 3 : 1.5, bw = Math.max(2, slot - gap);
  const X = (i: number) => L + i * slot + gap / 2;
  const Y = (v: number) => T0 + (1 - v / maxY) * (H - T0 - B);
  const every = n <= 10 ? 1 : n <= 20 ? 2 : 5;
  const WD = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const limitPath = limits.map((v, i) => v === null ? '' : `${i && limits[i - 1] !== null ? 'L' : 'M'}${(L + i * slot).toFixed(1)} ${Y(v).toFixed(1)} H${(L + (i + 1) * slot).toFixed(1)}`).join(' ');
  const avg = Math.round(totals.reduce((a, b) => a + b, 0) / n);
  const curLimit = [...limits].reverse().find(v => v !== null) ?? null;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ aspectRatio: W / H, width: '100%' }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          {dayList.map((d, i) => {
            let y = Y(0);
            return (
              <G key={d}>
                {perDay[i].map((v, k) => {
                  if (!v) return null;
                  const h = Y(0) - Y(v); y -= h;
                  return <Rect key={k} x={X(i)} y={y} width={bw} height={h} fill={rows[k].color} />;
                })}
                {i % every === 0 || i === n - 1 ? (
                  <SvgText x={X(i) + bw / 2} y={H - (n <= 10 ? 16 : 4)} textAnchor="middle" fontSize={10} fontWeight={over[i] ? '700' : '400'} fill={over[i] ? t.bad : t.ink2}>{String(Number(d.slice(8)))}</SvgText>
                ) : null}
                {n <= 10 ? <SvgText x={X(i) + bw / 2} y={H - 4} textAnchor="middle" fontSize={9} fill={t.ink2}>{WD[new Date(Engine.toDayNumber(d) * 864e5).getUTCDay()]}</SvgText> : null}
              </G>
            );
          })}
          <Line x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} stroke={t.line} />
          {limitPath.trim() ? <Path d={limitPath} stroke={t.ink} strokeWidth={1.3} strokeDasharray="4 3" fill="none" /> : null}
          {curLimit !== null ? <SvgText x={0} y={Y(curLimit) + 3} fontSize={10} fontWeight="700" fill={t.ink}>{eur0(curLimit)}</SvgText> : null}
          <SvgText x={0} y={Y(0) + 3} fontSize={10} fill={t.ink2}>0</SvgText>
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, columnGap: 10 }}>
        {rows.filter((_, k) => perDay.some(v => v[k] > 0)).map(r => (
          <View key={r.k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: r.color }} />
            <Text style={{ color: t.ink, fontSize: 12 }}>{r.k.name}</Text>
          </View>
        ))}
      </View>
      <T muted small>Пунктирът е дневният лимит за всеки ден. Над лимита: {over.filter(Boolean).length} от {n} {n === 1 ? 'ден' : 'дни'} · средно {eur0(avg)} на ден</T>
    </View>
  );
}

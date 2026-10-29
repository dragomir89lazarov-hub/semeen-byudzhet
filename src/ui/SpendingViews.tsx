// "Къде отидоха парите": four ways to look at this period's spending by category.
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';
import * as Engine from '../engine/budgetEngine';
import { sortedCycles, spentByStat, statItems, today } from '../data/derive';
import type { Cycle, Model } from '../data/types';
import { dLabel, eur0 } from '../lib/format';
import { periodName } from '../engine/periods';
import { catColor, useTheme } from '../lib/theme';
import { Donut } from './charts';
import { NUM, T } from './kit';
import { GroupToggle, useNav } from './nav';

type View4 = 'share' | 'line' | 'bubbles' | 'pyramid';
const LABELS: [View4, string][] = [['share', 'Дялове'], ['line', 'Линии'], ['bubbles', 'Кръгове'], ['pyramid', 'Пирамида']];

export default function SpendingViews({ m, c }: { m: Model; c: Cycle }) {
  const t = useTheme(); const nav = useNav();
  const [view, setView] = useState<View4>('share');
  const items = statItems(m, nav.grouped);
  const spent = spentByStat(m, c, nav.grouped);
  // archived categories only show up when they have spending in this period
  const rows = items
    .filter(it => (spent[it.key] || 0) > 0 || it.ids.some(id => !m.categories.find(k => k.id === id)?.archived))
    .map(it => ({ k: { id: it.key, name: it.name }, ids: it.ids, v: spent[it.key] || 0, plan: it.ids.reduce((a, id) => a + (c.budgets[id] || 0), 0), color: catColor(t, it.color), isGroup: it.isGroup }));
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
              <Pressable key={k.id} onPress={() => { if (!k.id.startsWith('g:')) { nav.setTxFilter(k.id); nav.setSub('txs'); } }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
      ) : view === 'line' ? <Lines m={m} c={c} rows={rows} /> : view === 'bubbles' ? <Bubbles rows={rows} total={total} /> : <Pyramid m={m} c={c} rows={rows} />}
    </View>
  );
}

type Row = { k: { id: string; name: string }; ids: string[]; v: number; color: string };

/** Cumulative spending per category, day by day through today. */
function Lines({ m, c, rows }: { m: Model; c: Cycle; rows: Row[] }) {
  const t = useTheme();
  const totalDays = Engine.daysInclusive(c.start, c.end);
  const lastDay = Math.min(Engine.daysInclusive(c.start, today()), totalDays);
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

/** Previous period (left) vs this period (right) per category. */
function Pyramid({ m, c, rows }: { m: Model; c: Cycle; rows: Row[] }) {
  const t = useTheme();
  const prev = [...sortedCycles(m)].reverse().find(x => x.end < c.start) || null;
  const nav = useNav();
  const prevSpent = prev ? spentByStat(m, prev, nav.grouped) : {};
  const data = rows.map(r => ({ ...r, p: prevSpent[r.k.id] || 0 })).filter(r => r.v > 0 || r.p > 0);
  if (!data.length) return <T muted small>Още няма разходи за сравнение.</T>;
  const max = Math.max(1, ...data.map(r => Math.max(r.v, r.p)));
  const soFar = Engine.cycleClock({ startDate: c.start, endDate: c.end }, today()).phase === 'active';
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        <Text style={{ flex: 1, textAlign: 'right', color: t.ink2, fontSize: 12, fontWeight: '700' }}>{prev ? periodName(prev.start, prev.end) : 'Няма предходен'}</Text>
        <View style={{ width: 96 }} />
        <Text style={{ flex: 1, color: t.ink, fontSize: 12, fontWeight: '700' }}>{periodName(c.start, c.end)}{soFar ? ' (досега)' : ''}</Text>
      </View>
      {data.map(r => (
        <View key={r.k.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
            <View style={{ height: 14, width: `${(r.p / max) * 100}%`, backgroundColor: r.color, opacity: 0.45, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }} />
            <Text style={[{ color: t.ink2, fontSize: 11 }, NUM]}>{eur0(r.p)}</Text>
          </View>
          <Text numberOfLines={2} style={{ width: 96, textAlign: 'center', color: t.ink, fontSize: 11.5, paddingHorizontal: 4 }}>{r.k.name}</Text>
          <View style={{ flex: 1, alignItems: 'flex-start', gap: 2 }}>
            <View style={{ height: 14, width: `${(r.v / max) * 100}%`, backgroundColor: r.color, borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
            <Text style={[{ color: r.v > r.p && r.p > 0 ? t.bad : t.ink, fontSize: 11, fontWeight: '600' }, NUM]}>{eur0(r.v)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}


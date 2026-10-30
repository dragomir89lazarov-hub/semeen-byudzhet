// History: one date filter at the top (presets or custom From/To). Every section below
// shows only what falls inside the chosen range, and the range is named after its month(s).
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { periodName } from '../engine/periods';
import * as Engine from '../engine/budgetEngine';
import SpendingViews from '../ui/SpendingViews';
import { catOf, computePool, currentCycle, sortedCycles, today, txSort } from '../data/derive';
import { useStore } from '../data/store';
import type { Cycle, Model, Tx } from '../data/types';
import { dLabel, eur0 } from '../lib/format';
import { catColor, useTheme } from '../lib/theme';
import DateButton from '../ui/DateButton';
import { Btn, Card, Field, H2, Label, NUM, Row, Screen, T } from '../ui/kit';
import { GroupToggle, TxRow, useNav } from '../ui/nav';

type Preset = 'current' | 'previous' | 'week' | 'custom';
const PRESETS: [Exclude<Preset, 'custom'>, string][] = [['current', 'Текущ период'], ['previous', 'Предишен период'], ['week', 'Календарна седмица']];

function rangeFor(p: Preset, m: Model): { from: string; to: string } {
  const td = today(); const cs = sortedCycles(m); const cur = currentCycle(m);
  const i = cur ? cs.findIndex(c => c.id === cur.id) : -1;
  if (p === 'current' && cur) return { from: cur.start, to: cur.end };
  if (p === 'previous' && i > 0) return { from: cs[i - 1].start, to: cs[i - 1].end };
  if (p === 'week') {                                     // Monday – Sunday of this week
    const wd = new Date(Engine.toDayNumber(td) * 864e5).getUTCDay();
    const mon = Engine.addDays(td, wd === 0 ? -6 : 1 - wd);
    return { from: mon, to: Engine.addDays(mon, 6) };
  }
  return cur ? { from: cur.start, to: cur.end } : { from: td, to: td };
}

const within = (d: string, from: string, to: string) => d >= from && d <= to;

/** Expenses per category, or per group when "Групи" is on (ids = the categories counted in the row). */
function byCategory(m: Model, txs: Tx[], grouped: boolean) {
  const map = new Map<string, { id: string; name: string; color: number; cents: number; count: number; ids: Set<string>; isGroup: boolean }>();
  for (const x of txs) if (x.kind === 'expense') {
    const k = catOf(m, x.categoryId);
    const isGroup = grouped && !!k?.group;
    const id = isGroup ? 'g:' + k!.group : x.categoryId || 'none';
    const row = map.get(id) || { id, name: isGroup ? k!.group! : k?.name || 'Без категория', color: k?.color ?? 3, cents: 0, count: 0, ids: new Set<string>(), isGroup };
    row.cents += x.amountCents; row.count += 1; if (x.categoryId) row.ids.add(x.categoryId); map.set(id, row);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents);
}

export default function HistoryScreen() {
  const t = useTheme();
  const { model: m } = useStore();
  const [preset, setPreset] = useState<Preset>('current');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(30);
  const [menu, setMenu] = useState(false);
  const nav = useNav();
  const range = preset === 'custom' && custom ? custom : rangeFor(preset, m);
  const { from, to } = range;
  const name = periodName(from, to);
  const txs = useMemo(() => m.txs.filter(x => within(x.occurredOn, from, to)), [m.txs, from, to]);

  const expenses = txs.filter(x => x.kind === 'expense');
  const spentAll = expenses.reduce((a, x) => a + x.amountCents, 0);
  const spentFunds = expenses.filter(x => x.bucketId).reduce((a, x) => a + x.amountCents, 0);
  const income = txs.filter(x => x.kind === 'income').reduce((a, x) => a + x.amountCents, 0);
  const saved = txs.reduce((a, x) => a + (x.kind === 'bucket_deposit' ? x.amountCents : x.kind === 'bucket_withdrawal' ? -x.amountCents : 0), 0);
  const cats = byCategory(m, txs, nav.grouped);
  const cycles = sortedCycles(m).filter(c => c.start <= to && c.end >= from).reverse();
  const exactCycle = cycles.find(c => c.start === from && c.end === to) || null;   // plans are shown only for a whole period
  const setRange = (r: { from: string; to: string }) => { setPreset('custom'); setCustom(r.from <= r.to ? r : { from: r.to, to: r.from }); };

  return (
    <Screen>
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 6 }}>
          <Pressable onPress={() => setMenu(!menu)} accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: menu ? t.accent : t.line, backgroundColor: t.bg, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12 }}>
            <Text style={{ color: t.ink2, fontSize: 13 }}>Период: </Text>
            <Text style={{ flex: 1, color: t.ink, fontWeight: '700', fontSize: 15 }}>{preset === 'custom' ? 'Избрани дати' : PRESETS.find(x => x[0] === preset)?.[1]}</Text>
            <Text style={{ color: t.ink2, fontSize: 13 }}>{menu ? '▲' : '▼'}</Text>
          </Pressable>
          {menu ? (
            <View style={{ borderWidth: 1, borderColor: t.line, borderRadius: 12, overflow: 'hidden' }}>
              {PRESETS.map(([k, l], i) => (
                <Pressable key={k} onPress={() => { setPreset(k); setOpen(null); setMenu(false); }}
                  style={{ paddingVertical: 12, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: preset === k ? t.accentSoft : t.surface }}>
                  <Text style={{ color: t.ink, fontWeight: preset === k ? '700' : '400' }}>{l}</Text>
                  <Text style={[{ color: t.ink2, fontSize: 12 }, NUM]}>{(() => { const r = rangeFor(k, m); return `${dLabel(r.from)} – ${dLabel(r.to)}`; })()}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="От"><DateButton value={from} onChange={v => { setMenu(false); setRange({ from: v, to }); }} /></Field>
          <Field label="До"><DateButton value={to} onChange={v => { setMenu(false); setRange({ from, to: v }); }} /></Field>
        </View>
      </Card>

      <Card style={{ borderRadius: 18 }}>
        <Label>Похарчено · {name}</Label>
        <Text adjustsFontSizeToFit numberOfLines={1} style={[{ color: t.ink, fontSize: 44, fontWeight: '800', letterSpacing: -1.2 }, NUM]}>{eur0(spentAll)}</Text>
        <T muted small>{dLabel(from)} – {dLabel(to)} · от общия бюджет {eur0(spentAll - spentFunds)} · от фондове {eur0(spentFunds)}</T>
        <T muted small>Приходи {eur0(income)} · внесено във фондове {eur0(saved)}</T>
      </Card>

      <Card>
        <Row><H2>Къде отидоха парите</H2><T muted small>{name}</T></Row>
        <SpendingViews m={m} from={from} to={to} cycle={exactCycle} />
      </Card>

      <Card style={{ gap: 0 }}>
        <Row><H2>Периоди</H2><T muted small>{cycles.length} {cycles.length === 1 ? 'период' : 'периода'}</T></Row>
        {cycles.length ? cycles.map((c, i) => (
          <CycleRow key={c.id} m={m} c={c} from={from} to={to} first={i === 0}
            expanded={cycles.length === 1 || open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} />
        )) : <T muted small style={{ paddingTop: 8 }}>Няма периоди в избраните дати.</T>}
      </Card>

      <Card style={{ gap: 0 }}>
        <Row><H2>По {nav.grouped ? 'групи' : 'категории'} · {name}</H2><GroupToggle m={m} /></Row>
        {cats.length ? (
          <>
            <View style={{ flexDirection: 'row', paddingTop: 10, paddingBottom: 4 }}>
              <Text style={{ flex: 1, color: t.ink2, fontSize: 12, fontWeight: '700' }}>Категория</Text>
              <Text style={{ width: 84, textAlign: 'right', color: t.ink2, fontSize: 12, fontWeight: '700' }}>Сума</Text>
              <Text style={{ width: 48, textAlign: 'right', color: t.ink2, fontSize: 12, fontWeight: '700' }}>Дял</Text>
              <Text style={{ width: 44, textAlign: 'right', color: t.ink2, fontSize: 12, fontWeight: '700' }}>Бр.</Text>
            </View>
            {cats.map(r => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: t.line, gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: catColor(t, r.color) }} />
                <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 13.5, fontWeight: r.isGroup ? '700' : '400' }}>{r.name}</Text>
                <Text style={[{ width: 84, textAlign: 'right', color: t.ink, fontSize: 13.5, fontWeight: '600' }, NUM]}>{eur0(r.cents)}</Text>
                <Text style={[{ width: 48, textAlign: 'right', color: t.ink2, fontSize: 13 }, NUM]}>{spentAll ? Math.round((r.cents / spentAll) * 100) : 0}%</Text>
                <Text style={[{ width: 44, textAlign: 'right', color: t.ink2, fontSize: 13 }, NUM]}>{r.count}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', paddingVertical: 8, borderTopWidth: 2, borderTopColor: t.line }}>
              <Text style={{ flex: 1, color: t.ink, fontWeight: '700' }}>Общо</Text>
              <Text style={[{ width: 84, textAlign: 'right', color: t.ink, fontWeight: '800' }, NUM]}>{eur0(spentAll)}</Text>
              <View style={{ width: 92 }} />
            </View>
          </>
        ) : <T muted small style={{ paddingTop: 8 }}>Няма разходи в избраните дати.</T>}
      </Card>

      <Card style={{ gap: 0 }}>
        <Row><H2>Записи</H2><T muted small>{txs.length} · докоснете запис, за да го промените</T></Row>
        {txs.length ? [...txs].sort(txSort).slice(0, shown).map((x, i) => (
          <TxRow key={x.id} m={m} tx={x} first={i === 0} onPress={() => nav.openSheet({ editId: x.id })} />
        )) : <T muted small style={{ paddingTop: 8 }}>Няма записи в избраните дати.</T>}
        {txs.length > shown ? <Btn variant="link" title={`Покажи още (${txs.length - shown})`} onPress={() => setShown(n => n + 50)} style={{ alignSelf: 'flex-start' }} /> : null}
      </Card>
    </Screen>
  );
}

function CycleRow({ m, c, from, to, first, expanded, onToggle }: {
  m: Model; c: Cycle; from: string; to: string; first: boolean; expanded: boolean; onToggle: () => void;
}) {
  const t = useTheme();
  const a = c.start > from ? c.start : from, b = c.end < to ? c.end : to;     // part of the cycle inside the filter
  const txs = m.txs.filter(x => within(x.occurredOn, a, b));
  const spent = txs.filter(x => x.kind === 'expense').reduce((s, x) => s + x.amountCents, 0);
  const income = txs.filter(x => x.kind === 'income').reduce((s, x) => s + x.amountCents, 0);
  const whole = a === c.start && b === c.end;
  const td = today(); const done = td > c.end; const current = !done && td >= c.start;
  const left = whole ? computePool(m, c, done ? c.end : td).remainingCents : null;
  const nav = useNav();
  const cats = byCategory(m, txs, nav.grouped);
  return (
    <View>
      <Pressable onPress={onToggle} style={{ paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: t.line, gap: 3 }}>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>{periodName(c.start, c.end)}{current ? ' · сега' : ''}</Text>
            <Text style={[{ color: t.ink2, fontSize: 12.5 }, NUM]}>{dLabel(c.start)} – {dLabel(c.end)}{whole ? '' : ` (показано ${dLabel(a)} – ${dLabel(b)})`}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[{ color: t.ink, fontWeight: '700' }, NUM]}>{eur0(spent)}</Text>
            <Text style={[{ color: t.ink2, fontSize: 12 }, NUM]}>похарчено</Text>
          </View>
        </Row>
        <Row>
          <T muted small>Приходи {eur0(income)}</T>
          {left !== null ? <T small style={{ color: left < 0 ? t.bad : t.ink2 }}>{done ? 'Остатък' : 'Остатък досега'} {eur0(left)}</T> : null}
        </Row>
      </Pressable>
      {expanded ? (
        <View style={{ gap: 6, paddingBottom: 12 }}>
          {cats.length ? cats.map(r => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: catColor(t, r.color) }} />
              <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 13.5 }}>{r.name}</Text>
              <Text style={[{ color: t.ink, fontSize: 13.5 }, NUM]}>{eur0(r.cents)}{(() => { const plan = [...r.ids].reduce((a, id) => a + (c.budgets[id] || 0), 0); return plan ? <Text style={{ color: t.ink2 }}> от {eur0(plan)}</Text> : null; })()}</Text>
            </View>
          )) : <T muted small>Няма разходи.</T>}
        </View>
      ) : null}
    </View>
  );
}


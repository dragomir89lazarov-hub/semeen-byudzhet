import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { activeCats, computePool, currentCycle, sortedCycles, spentByCat, today } from '../data/derive';
import { useStore } from '../data/store';
import { dLabel, eur0 } from '../lib/format';
import { catColor, useTheme } from '../lib/theme';
import { MiniBars } from '../ui/charts';
import { Card, H2, Label, NUM, Pill, Row, Screen, T } from '../ui/kit';

export default function HistoryScreen() {
  const t = useTheme();
  const { model: m } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const cs = sortedCycles(m);
  if (!cs.length) return <Screen><Card><H2>Още няма периоди</H2></Card></Screen>;
  const td = today(); const cur = currentCycle(m); const cats = activeCats(m);
  const sums = cs.map(c => {
    const done = td > c.end; const r = computePool(m, c, done ? c.end : td);
    return { c, r, done, spent: r.spentFixedCents + r.spentFlexibleCents, byCat: spentByCat(m, c), current: cur?.id === c.id };
  });
  const recent = sums.slice(-6);
  const done = recent.filter(s => s.done);
  const yr = td.slice(0, 4);
  const ytd: Record<string, number> = {}; let ytdTotal = 0, ytdIncome = 0;
  for (const x of m.txs) if (x.occurredOn.slice(0, 4) === yr) {
    if (x.kind === 'expense' && !x.bucketId) { ytd[x.categoryId!] = (ytd[x.categoryId!] || 0) + x.amountCents; ytdTotal += x.amountCents; }
    if (x.kind === 'income') ytdIncome += x.amountCents;
  }
  const n = sums.filter(s => s.done).length;
  const avgCycle = n ? sums.filter(s => s.done).reduce((a, s) => a + s.spent, 0) / n : 0;
  const cyclesThisYear = Math.max(1, sums.filter(s => s.c.start.slice(0, 4) === yr || s.c.end.slice(0, 4) === yr).length);

  return (
    <Screen>
      <Card style={{ borderRadius: 18 }}>
        <Label>От началото на {yr} г.</Label>
        <Text style={[{ color: t.ink, fontSize: 44, fontWeight: '800', letterSpacing: -1.2 }, NUM]}>{eur0(ytdTotal)} <Text style={{ fontSize: 18, fontWeight: '500', color: t.ink2 }}>похарчено</Text></Text>
        <T muted small>Приходи {eur0(ytdIncome)} · Среден период {eur0(avgCycle)} от {n} {n === 1 ? 'приключил период' : 'приключили периода'}</T>
      </Card>

      <Card style={{ gap: 0 }}>
        <H2>Периоди</H2>
        {[...sums].reverse().map((s, i) => (
          <View key={s.c.id}>
            <Pressable onPress={() => setOpen(open === s.c.id ? null : s.c.id)} style={{ paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, gap: 3 }}>
              <Row>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[{ color: t.ink, fontWeight: '700' }, NUM]}>{dLabel(s.c.start)} – {dLabel(s.c.end)}</Text>
                  {s.current ? <Pill status="on_track" text="Сега" /> : null}
                </View>
                <Text style={[{ color: t.ink, fontWeight: '700' }, NUM]}>{eur0(s.spent)} <Text style={{ color: t.ink2, fontWeight: '400', fontSize: 13 }}>похарчено</Text></Text>
              </Row>
              <Row>
                <T muted small>Приходи {eur0(s.r.incomeCents)} · Спестено {eur0(s.r.netToBucketsCents)}</T>
                <T small style={{ color: s.r.remainingCents < 0 ? t.bad : t.ink2 }}>{s.done ? 'Остатък' : 'Досега'} {eur0(s.r.remainingCents)}</T>
              </Row>
            </Pressable>
            {open === s.c.id ? (
              <View style={{ gap: 6, paddingBottom: 12 }}>
                {cats.map(k => (
                  <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: catColor(t, k.color) }} />
                    <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 13.5 }}>{k.name}</Text>
                    <Text style={[{ color: t.ink, fontSize: 13.5 }, NUM]}>{eur0(s.byCat[k.id] || 0)}{s.c.budgets[k.id] ? <Text style={{ color: t.ink2 }}> от {eur0(s.c.budgets[k.id])}</Text> : null}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </Card>

      <Card style={{ gap: 0 }}>
        <Row><H2>Тенденции по категории</H2><T muted small>{recent.length} периода</T></Row>
        <T muted small style={{ marginTop: 4, marginBottom: 6 }}>Промяната сравнява последните два приключили периода. Избледнелият стълб е текущият период.</T>
        {cats.map((k, i) => {
          const a = done[done.length - 1]?.byCat[k.id] || 0, b = done[done.length - 2]?.byCat[k.id] || 0;
          const ch = b ? Math.round(((a - b) / b) * 100) : null;
          return (
            <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: t.ink, fontWeight: '500' }}>{k.name}</Text>
                <Text style={[{ color: t.ink2, fontSize: 12.5 }, NUM]}>{eur0(a)} миналия период</Text>
              </View>
              <MiniBars values={recent.map(s => s.byCat[k.id] || 0)} color={catColor(t, k.color)} doneFlags={recent.map(s => s.done)} />
              <Text style={[{ width: 52, textAlign: 'right', fontWeight: '700', fontSize: 12.5, color: ch === null ? t.ink2 : ch > 0 ? t.bad : ch < 0 ? t.good : t.ink2 }, NUM]}>
                {ch === null ? '—' : `${ch > 0 ? '+' : ''}${ch}%`}
              </Text>
            </View>
          );
        })}
      </Card>

      <Card>
        <H2>По категории от началото на годината</H2>
        <ScrollView horizontal>
          <View style={{ minWidth: '100%' }}>
            {[['Категория', yr, 'Дял', 'На период'], ...cats.map(k => [k.name, eur0(ytd[k.id] || 0), `${ytdTotal ? Math.round(((ytd[k.id] || 0) / ytdTotal) * 100) : 0}%`, eur0((ytd[k.id] || 0) / cyclesThisYear)])].map((cells, i) => (
              <View key={i} style={{ flexDirection: 'row', paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
                {cells.map((cell, j) => (
                  <Text key={j} numberOfLines={1} style={[{ width: j === 0 ? 150 : 72, textAlign: j === 0 ? 'left' : 'right', color: i === 0 ? t.ink2 : t.ink, fontSize: i === 0 ? 12 : 13.5, fontWeight: i === 0 ? '700' : '400' }, NUM]}>{cell}</Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </Card>
    </Screen>
  );
}

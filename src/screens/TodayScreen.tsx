import React from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Engine from '../engine/budgetEngine';
import {
  activeCats, bucketOf, computeFund, computePool, currentCycle, defaultFundId, inCycle, poolOf, today, txSort, velocity,
} from '../data/derive';
import { useStore } from '../data/store';
import type { Bucket, Cycle, Model } from '../data/types';
import { days, dLabel, dwLabel, eur, eur0 } from '../lib/format';
import { useTheme } from '../lib/theme';
import { Track, VelocityChart } from '../ui/charts';
import SpendingViews from '../ui/SpendingViews';
import { periodName } from '../engine/periods';
import { Btn, Card, Chip, Chips, H2, Label, NUM, Pill, Row, Screen, T } from '../ui/kit';
import { TxRow, useNav } from '../ui/nav';

type Metric = 'today' | 'week' | 'period' | 'avg';
const METRIC_LABEL: Record<Metric, string> = { today: 'Остатък за днес', week: 'Остатък за седмицата', period: 'Остатък до края на периода', avg: 'Среден дневен остатък' };
const METRIC_SHORT: Record<Metric, string> = { today: 'За днес', week: 'Седмица', period: 'До края', avg: 'На ден' };
const STATUS_TEXT = { on_track: 'В график', tight: 'На ръба', overspending: 'Твърде бързо', overdrawn: 'Над бюджета' } as const;

function Metrics({ vals }: { vals: Record<Metric, number> }) {
  const t = useTheme(); const nav = useNav();
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
      {(['today', 'week', 'period', 'avg'] as Metric[]).map(k => {
        const on = nav.metric === k;
        return (
          <Pressable key={k} onPress={() => nav.setMetric(k)} accessibilityState={{ selected: on }} accessibilityLabel={METRIC_LABEL[k]}
            style={{ flex: 1, minWidth: 0, borderWidth: on ? 2 : 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accentSoft : t.bg, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 7 }}>
            <Text numberOfLines={1} style={{ color: t.ink2, fontSize: 12, fontWeight: '700' }}>{METRIC_SHORT[k]}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[{ color: t.ink, fontSize: 13.5, fontWeight: '700' }, NUM]}>{eur(vals[k])}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BigNumber({ value, label, explain, bad }: { value: number; label: string; explain: string; bad?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <T muted small style={{ fontWeight: '500' }}>{label}</T>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[{ fontSize: 50, fontWeight: '800', letterSpacing: -1.5, color: bad ? t.bad : t.ink }, NUM]}>{eur(value)}</Text>
      <T muted small>{explain}</T>
    </View>
  );
}

function Kpis({ items }: { items: [string, number][] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.line }}>
      {items.map(([k, v]) => (
        <View key={k} style={{ flex: 1 }}>
          <Text style={[{ color: t.ink, fontSize: 17, fontWeight: '600' }, NUM]}>{eur0(v)}</Text>
          <Text style={{ color: t.ink2, fontSize: 12 }}>{k}</Text>
        </View>
      ))}
    </View>
  );
}

export default function TodayScreen() {
  const { model: m } = useStore(); const nav = useNav();
  const c = currentCycle(m);
  if (nav.sub === 'txs') return <TxListScreen m={m} c={c} />;
  if (!c) return <Screen><Card><H2>Още няма период</H2><T muted>Задайте го в „Настройки“.</T></Card></Screen>;
  const fid = defaultFundId(m);
  return fid === poolOf(m).id ? <PoolToday m={m} c={c} /> : <FundToday m={m} c={c} b={bucketOf(m, fid)!} />;
}

function PoolToday({ m, c }: { m: Model; c: Cycle }) {
  const t = useTheme(); const nav = useNav();
  const r = computePool(m, c);
  const clock = Engine.cycleClock({ startDate: c.start, endDate: c.end }, today());
  const ended = clock.phase === 'ended';
  const pool = poolOf(m);
  if (ended) {
    return (
      <Screen>
        <Card><Label>★ {pool.name} · периодът приключи на {dLabel(c.end)}</Label>
          <BigNumber value={r.remainingCents} label="Остатък" explain="Започнете следващия период в „Настройки“." /></Card>
      </Screen>
    );
  }
  const flexBudget = r.remainingCents + r.spentFlexibleCents;
  const usedPct = flexBudget > 0 ? Math.min(100, (r.spentFlexibleCents / flexBudget) * 100) : 100;
  const timePct = Math.min(100, ((clock.daysElapsed + 1) / clock.totalDays) * 100);
  let msg: string;
  if (r.status === 'overdrawn') msg = `Бюджетът е надхвърлен с ${eur(-r.remainingCents)}. Прехвърлете пари от фонд или намалете разходите.`;
  else if (r.status === 'overspending' && r.runOutDate) msg = `С това темпо парите ще свършат на ${dwLabel(r.runOutDate)}, ${days(Engine.daysInclusive(r.runOutDate, c.end) - 1)} преди заплата.`;
  else if (r.status === 'tight') msg = `В график, но на ръба: около ${eur(r.projectedEndBalanceCents)} ще останат до заплата.`;
  else msg = `В график: около ${eur(r.projectedEndBalanceCents)} ще останат до заплата.`;
  const vals = { today: r.leftTodayCents, week: r.leftThisWeekCents, period: r.remainingCents, avg: r.averageDailyRemainingCents };
  const explain = {
    today: `Дневен лимит ${eur(r.dailyAllowanceCents)} (остатъкът в полунощ ÷ ${days(r.daysLeft)}) − похарчено днес ${eur(r.spentTodayCents)}`,
    week: `Лимит за ${dLabel(r.weekStart)} – ${dLabel(r.weekEnd)}: ${eur(r.weekAllowanceCents)} − похарчено тази седмица ${eur(r.spentThisWeekCents)}`,
    period: `За оставащите ${days(r.daysLeft)}, до ${dwLabel(c.end)} включително`,
    avg: `${eur(r.remainingCents)} ÷ ${days(r.daysLeft)} до края на периода`,
  }[nav.metric];
  const series = velocity(m, c);
  const last = series[series.length - 1];
  const recent = m.txs.filter(x => inCycle(x, c)).sort(txSort).slice(0, 5);
  return (
    <Screen>
      <Card style={{ borderRadius: 18, gap: 12 }}>
        <Row><Label>★ {pool.name}</Label><Pill status={r.status} text={STATUS_TEXT[r.status]} /></Row>
        <BigNumber value={vals[nav.metric]} label={METRIC_LABEL[nav.metric]} explain={explain} bad={vals[nav.metric] < 0 || r.status === 'overdrawn' || r.status === 'overspending'} />
        <Metrics vals={vals} />
        {r.leftTodayCents < 0 ? (
          <View style={{ backgroundColor: t.badSoft, borderRadius: 12, padding: 10 }}>
            <T small style={{ color: t.bad }}>Днешният лимит е превишен с {eur(-r.leftTodayCents)}. В полунощ лимитът се изчислява наново от реалния остатък, разделен на оставащите дни, така че разходът се разпределя по целия период.</T>
          </View>
        ) : null}
        <T>{msg} <Text style={{ color: t.ink2 }}>Заплата: {dwLabel(Engine.addDays(c.end, 1))}</Text></T>
        <View style={{ gap: 8 }}>
          <View style={{ gap: 4 }}><T muted small>Изминало време: {Math.round(timePct)}%</T><Track t={t} pct={timePct} color={t.ink2} /></View>
          <View style={{ gap: 4 }}><T muted small>Използван бюджет: {Math.round(usedPct)}%</T><Track t={t} pct={usedPct} color={usedPct > timePct + 5 ? t.bad : t.accent} /></View>
        </View>
        <Kpis items={[['Похарчено', r.spentFixedCents + r.spentFlexibleCents], ['Дневен лимит', r.dailyAllowanceCents], ['Внесено във фондове', r.netToBucketsCents]]} />
      </Card>

      <Card>
        <Row><H2>Темп на харчене</H2><T muted small>спрямо равномерното харчене</T></Row>
        {last ? <T muted small>{last.actualCents > last.safeCents ? `${eur0(last.actualCents - last.safeCents)} над равномерния темп` : `${eur0(last.safeCents - last.actualCents)} под равномерния темп`}</T> : null}
        <VelocityChart t={t} series={series} budget={flexBudget} total={Engine.daysInclusive(c.start, c.end)} start={c.start} end={c.end} />
      </Card>

      <Card>
        <Row><H2>Къде отидоха парите</H2><T muted small>{periodName(c.start, c.end)}</T></Row>
        <SpendingViews m={m} from={c.start} to={c.end} cycle={c} onCategory={id => { nav.setTxFilter(id); nav.setSub('txs'); }} />
      </Card>

      <Card>
        <Row><H2>Последни записи</H2><Btn variant="link" title="Виж всички" onPress={() => nav.setSub('txs')} /></Row>
        {recent.length ? recent.map((x, i) => <TxRow key={x.id} m={m} tx={x} first={i === 0} onPress={() => nav.openSheet({ editId: x.id })} />)
          : <T muted small>Още няма записи в този период. Натиснете +, за да добавите първия разход.</T>}
      </Card>
    </Screen>
  );
}

function FundToday({ m, c, b }: { m: Model; c: Cycle; b: Bucket }) {
  const nav = useNav();
  const f = computeFund(m, b.id, c);
  const clock = Engine.cycleClock({ startDate: c.start, endDate: c.end }, today());
  const vals = { today: f.leftTodayCents, week: f.leftThisWeekCents, period: f.balanceCents, avg: f.averageDailyRemainingCents };
  const explain = {
    today: `Дневен лимит ${eur(f.dailyAllowanceCents)} (наличността в полунощ ÷ ${days(f.daysLeft)}) − платено днес ${eur(f.spentTodayCents)}`,
    week: `Лимит за ${dLabel(f.weekStart)} – ${dLabel(f.weekEnd)}: ${eur(f.weekAllowanceCents)} − платено тази седмица ${eur(f.spentThisWeekCents)}`,
    period: `Наличност във фонда за оставащите ${days(f.daysLeft)}, до ${dwLabel(c.end)} включително`,
    avg: `${eur(f.balanceCents)} ÷ ${days(f.daysLeft)} до края на периода`,
  }[nav.metric];
  const moves = m.txs.filter(x => x.bucketId === b.id).sort(txSort);
  const inCyc = moves.filter(x => inCycle(x, c));
  const paid = inCyc.filter(x => x.kind === 'expense').reduce((a, x) => a + x.amountCents, 0);
  const added = inCyc.reduce((a, x) => a + (x.kind === 'bucket_deposit' ? x.amountCents : x.kind === 'bucket_withdrawal' ? -x.amountCents : 0), 0);
  const pr = computePool(m, c);
  return (
    <Screen>
      <Card style={{ borderRadius: 18, gap: 12 }}>
        <Row><Label>★ {b.name}</Label>{clock.phase === 'ended' ? <Pill status="tight" text="Периодът приключи" /> : null}</Row>
        <BigNumber value={vals[nav.metric]} label={METRIC_LABEL[nav.metric]} explain={explain} bad={vals[nav.metric] < 0} />
        <Metrics vals={vals} />
        <T>Плащанията от този фонд не намаляват общия бюджет.{b.targetCents ? ` Цел ${eur0(b.targetCents)} (${Math.max(0, Math.round((f.balanceCents / b.targetCents) * 100))}%).` : ''}</T>
        <Kpis items={[['Внесено този период', added], ['Платено този период', paid], ['Общ бюджет до края', pr.remainingCents]]} />
      </Card>
      <Card>
        <Row><H2>Движения във фонда</H2><Btn variant="link" title="Всички фондове" onPress={() => nav.setTab('buckets')} /></Row>
        {moves.length ? moves.slice(0, 8).map((x, i) => <TxRow key={x.id} m={m} tx={x} first={i === 0} onPress={() => nav.openSheet({ editId: x.id })} />)
          : <T muted small>Още няма движения.</T>}
      </Card>
    </Screen>
  );
}

function TxListScreen({ m, c }: { m: Model; c: Cycle | null }) {
  const t = useTheme(); const nav = useNav();
  const f = nav.txFilter;
  const list = m.txs.filter(x => c && inCycle(x, c)).filter(x => f === 'all' ? true : f === 'income' ? x.kind === 'income'
    : f === 'buckets' ? x.kind !== 'income' && !!x.bucketId : x.categoryId === f).sort(txSort);
  const chips: [string, string][] = [['all', 'Всички'], ['income', 'Приходи'], ['buckets', 'Фондове'], ...activeCats(m).map(k => [k.id, k.name] as [string, string])];
  const groups: { day: string; items: typeof list }[] = [];
  for (const x of list) { const g = groups[groups.length - 1]; if (g && g.day === x.occurredOn) g.items.push(x); else groups.push({ day: x.occurredOn, items: [x] }); }
  return (
    <Screen>
      <Row><Btn variant="link" title="← Днес" onPress={() => { nav.setSub(null); nav.setTxFilter('all'); }} /><T muted small>{list.length} {list.length === 1 ? 'запис' : 'записа'}</T></Row>
      <Chips>{chips.map(([k, l]) => <Chip key={k} label={l} selected={f === k} onPress={() => nav.setTxFilter(k)} />)}</Chips>
      <Card style={{ gap: 0 }}>
        {groups.length ? groups.map(g => (
          <View key={g.day}>
            <Text style={{ color: t.ink2, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', paddingTop: 12, paddingBottom: 2 }}>{dwLabel(g.day)}</Text>
            {g.items.map((x, i) => <TxRow key={x.id} m={m} tx={x} first={i === 0} onPress={() => nav.openSheet({ editId: x.id })} />)}
          </View>
        )) : <T muted small>Няма съвпадащи записи.</T>}
      </Card>
    </Screen>
  );
}


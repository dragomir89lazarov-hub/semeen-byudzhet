import * as Updates from 'expo-updates';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as Engine from '../engine/budgetEngine';
import { activeCats, computePool, currentCycle, cycleError, sortedCycles } from '../data/derive';
import { useStore } from '../data/store';
import { dLabel, dwLabel, eur } from '../lib/format';
import { catColor, useTheme } from '../lib/theme';
import DateButton from '../ui/DateButton';
import { Btn, Card, Check, Chip, Field, H2, Input, Screen, T, useToast } from '../ui/kit';

const centsText = (c: number | undefined) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

export default function SetupScreen() {
  const t = useTheme(); const toast = useToast();
  const s = useStore(); const m = s.model;
  const c = currentCycle(m);
  const cats = activeCats(m);
  const rule = m.settings.payday.type === 'monthly_day' ? m.settings.payday : { type: 'monthly_day' as const, day: 25, weekend: 'previous_business_day' as const };

  const [start, setStart] = useState(c?.start || ''); const [end, setEnd] = useState(c?.end || '');
  const [cycleErr, setCycleErr] = useState('');
  const [roll, setRoll] = useState(true);
  const [payDay, setPayDay] = useState(String(rule.day));
  const [weekend, setWeekend] = useState(rule.weekend || 'previous_business_day');
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [newCat, setNewCat] = useState('');
  const [newBucket, setNewBucket] = useState(''); const [newTarget, setNewTarget] = useState('');
  const [people, setPeople] = useState(m.settings.people);
  const [updateMsg, setUpdateMsg] = useState('');

  useEffect(() => { setStart(c?.start || ''); setEnd(c?.end || ''); }, [c?.id, c?.start, c?.end]);
  useEffect(() => { if (c) setPlan(Object.fromEntries(cats.map(k => [k.id, centsText(c.budgets[k.id])]))); }, [c?.id, JSON.stringify(c?.budgets), cats.length]);
  useEffect(() => { setPeople(m.settings.people); }, [m.settings.people.join('|')]);

  const next = c ? sortedCycles(m).find(x => x.start > c.end) : null;
  const prop = c ? Engine.proposeNextCycle({ startDate: c.start, endDate: c.end }, rule) : null;
  const leftover = c ? computePool(m, c, c.end).remainingCents : 0;

  async function saveDates() {
    if (!c) return;
    const msg = cycleError(Engine.validateCycle({ startDate: start, endDate: end }, sortedCycles(m).filter(x => x.id !== c.id).map(x => ({ id: x.id, startDate: x.start, endDate: x.end }))));
    if (msg) return setCycleErr(msg);
    setCycleErr(''); await s.saveCycle({ id: c.id, start, end }); toast('Датите са записани');
  }
  async function startNext() {
    if (!c || !prop) return;
    const id = await s.saveCycle({ start: prop.startDate, end: prop.endDate, carryoverCents: roll ? Math.max(0, leftover) : 0 });
    await s.saveBudgets(id, c.budgets);
    toast('Следващият период е създаден');
  }
  async function savePlan() {
    if (!c) return;
    const out: Record<string, number> = {};
    for (const k of cats) {
      const raw = (plan[k.id] || '').trim(); if (!raw) continue;
      const v = Engine.parseAmountToCents(raw);
      if (v === null) return toast(`Проверете сумата за „${k.name}“.`);
      if (v > 0) out[k.id] = v;
    }
    await s.saveBudgets(c.id, out); toast('Планът е записан');
  }
  async function checkUpdates() {
    try {
      setUpdateMsg('Проверка…');
      const r = await Updates.checkForUpdateAsync();
      if (!r.isAvailable) return setUpdateMsg('Приложението е с последната версия.');
      setUpdateMsg('Изтегляне на новата версия…');
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch { setUpdateMsg('Проверката не е възможна в момента.'); }
  }

  return (
    <Screen>
      {s.pending ? <Card style={{ backgroundColor: t.warnSoft }}><T style={{ color: t.warn }}>{s.pending} промени чакат връзка с интернет и ще се изпратят автоматично.</T></Card> : null}

      <Card>
        <H2>Текущ период</H2>
        <T muted small>„Остатък до края на периода“ и средният дневен остатък в „Днес“ се изчисляват до крайната дата тук.</T>
        {c ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Начало"><DateButton value={start} onChange={setStart} /></Field>
              <Field label="Край (последен ден)"><DateButton value={end} onChange={setEnd} /></Field>
            </View>
            {cycleErr ? <T small style={{ color: t.bad }}>{cycleErr}</T> : null}
            <Btn title="Запази датите" onPress={saveDates} style={{ alignSelf: 'flex-start' }} />
          </>
        ) : <T muted>Още няма период.</T>}
      </Card>

      <Card>
        <H2>Следващ период</H2>
        {next ? <T muted>Вече е зададен: {dLabel(next.start)} – {dLabel(next.end)}.</T> : prop ? (
          <>
            <T>Предложение според деня на заплатата: <Text style={{ fontWeight: '700' }}>{dwLabel(prop.startDate)} – {dwLabel(prop.endDate)}</Text>. Датите могат да се променят, след като го започнете.</T>
            <Check label={`Прехвърли остатъка (${eur(Math.max(0, leftover))})`} value={roll} onChange={setRoll} />
            <Btn variant="primary" title="Започни следващия период" onPress={startNext} style={{ alignSelf: 'flex-start' }} />
          </>
        ) : null}
      </Card>

      <Card>
        <H2>Ден на заплатата</H2>
        <Field label="Ден от месеца"><Input keyboardType="number-pad" value={payDay} onChangeText={setPayDay} maxLength={2} /></Field>
        <T muted small>Ако се падне в почивен ден, се изплаща:</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {([['previous_business_day', 'в петъка преди това'], ['next_business_day', 'в понеделника след това'], ['none', 'в същия ден']] as const).map(([v, l]) =>
            <Chip key={v} label={l} selected={weekend === v} onPress={() => setWeekend(v)} />)}
        </View>
        <Btn title="Запази" style={{ alignSelf: 'flex-start' }} onPress={async () => {
          const day = Math.max(1, Math.min(31, parseInt(payDay, 10) || 25));
          await s.updateSettings({ payday: { type: 'monthly_day', day, weekend } }); toast('Денят на заплатата е записан');
        }} />
      </Card>

      {c ? (
        <Card>
          <H2>План за този период</H2>
          <T muted small>Планираните суми се показват като цели в „Къде отидоха парите“ (напр. „120 € от 650 €“). Не променят дневния лимит.</T>
          {cats.map(k => (
            <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: catColor(t, k.color) }} />
              <Text numberOfLines={2} style={{ flex: 1, color: t.ink }}>{k.name}</Text>
              <Input style={{ width: 110, textAlign: 'right' }} keyboardType="decimal-pad" placeholder="0 €" value={plan[k.id] || ''} onChangeText={v => setPlan(p => ({ ...p, [k.id]: v }))} />
            </View>
          ))}
          <Btn title="Запази плана" onPress={savePlan} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}

      <Card>
        <H2>Категории</H2>
        {cats.map(k => (
          <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: catColor(t, k.color) }} />
            <Text numberOfLines={1} style={{ flex: 1, color: t.ink }}>{k.name}</Text>
          </View>
        ))}
        <Input placeholder="Нова категория" value={newCat} onChangeText={setNewCat} />
        <Btn title="Добави категория" style={{ alignSelf: 'flex-start' }} onPress={async () => {
          const name = newCat.trim(); if (!name) return toast('Въведете име на категория.');
          if (m.categories.some(k => k.name.toLowerCase() === name.toLowerCase())) return toast('Вече има категория с това име.');
          await s.addCategory(name, false); setNewCat(''); toast('Категорията е добавена');
        }} />
      </Card>

      <Card>
        <H2>Спестовни фондове</H2>
        <Input placeholder="Име на нов фонд" value={newBucket} onChangeText={setNewBucket} />
        <Input placeholder="Цел в € (по избор)" keyboardType="decimal-pad" value={newTarget} onChangeText={setNewTarget} />
        <Btn title="Добави фонд" style={{ alignSelf: 'flex-start' }} onPress={async () => {
          const name = newBucket.trim(); if (!name) return toast('Въведете име на фонд.');
          const target = newTarget.trim() ? Engine.parseAmountToCents(newTarget) : null;
          if (newTarget.trim() && !target) return toast('Проверете сумата за целта.');
          await s.addBucket(name, target); setNewBucket(''); setNewTarget(''); toast('Фондът е добавен');
        }} />
      </Card>

      <Card>
        <H2>Хора</H2>
        {people.map((p, i) => (
          <Field key={i} label={`Човек ${i + 1}`}><Input value={p} onChangeText={v => setPeople(ps => ps.map((x, j) => (j === i ? v : x)))} /></Field>
        ))}
        <Btn title="Запази" style={{ alignSelf: 'flex-start' }} onPress={async () => {
          await s.updateSettings({ people: people.map((p, i) => p.trim() || m.settings.people[i]) }); toast('Записано');
        }} />
      </Card>

      <Card>
        <H2>Покана за партньора</H2>
        <T muted small>Съпругата ви инсталира приложението, създава си профил и избира „Присъединяване с код“.</T>
        <Text selectable style={{ color: t.accent, fontSize: 28, fontWeight: '800', letterSpacing: 4 }}>{m.settings.inviteCode}</Text>
      </Card>

      <Card>
        <H2>Приложение</H2>
        <Btn title="Провери за обновления" onPress={checkUpdates} style={{ alignSelf: 'flex-start' }} />
        {updateMsg ? <T muted small>{updateMsg}</T> : null}
        <T muted small>Версия {Updates.runtimeVersion || '—'}{Updates.updateId ? ` · ${Updates.updateId.slice(0, 8)}` : ''}</T>
        <Btn variant="danger" title="Изход от профила" onPress={() => s.signOut()} style={{ alignSelf: 'flex-start' }} />
      </Card>
    </Screen>
  );
}

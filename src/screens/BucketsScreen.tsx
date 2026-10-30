import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { bucketBalance, computePool, currentCycle, defaultFundId, inCycle, poolOf, savingsOf, today, txSort } from '../data/derive';
import type { Bucket } from '../data/types';
import { useStore } from '../data/store';
import { dLabel, eur, eur0 } from '../lib/format';
import { catColor, useTheme } from '../lib/theme';
import { Ring, WalletIcon } from '../ui/charts';
import { Btn, Card, ColorPicker, Field, H2, Input, Label, NUM, Screen, T, useToast } from '../ui/kit';
import * as Engine from '../engine/budgetEngine';
import { TxRow, useNav } from '../ui/nav';

export default function BucketsScreen() {
  const t = useTheme(); const nav = useNav(); const toast = useToast();
  const { model: m, updateSettings, addBucket } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState(''); const [newTarget, setNewTarget] = useState(''); const [newErr, setNewErr] = useState('');
  const c = currentCycle(m);
  const pool = poolOf(m);
  const bs = savingsOf(m);
  const total = bs.reduce((a, b) => a + bucketBalance(m, b.id), 0);
  const def = defaultFundId(m);
  const pr = c ? computePool(m, c) : null;

  const DefaultControl = ({ id, name }: { id: string; name: string }) => def === id
    ? <View style={{ backgroundColor: t.accentSoft, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}><Text style={{ color: t.accent, fontWeight: '800', fontSize: 13.5 }}>★ Основна</Text></View>
    : <Btn variant="accentOutline" title="☆ Направи основна" onPress={async () => { await updateSettings({ defaultFund: id }); toast(`„${name}“ е основната сметка`); }} />;

  return (
    <Screen>
      <Card style={{ borderRadius: 18 }}>
        <Label>Общо в спестовните сметки</Label>
        <Text adjustsFontSizeToFit numberOfLines={1} style={[{ color: t.ink, fontSize: 44, fontWeight: '800', letterSpacing: -1.2 }, NUM]}>{eur(total)}</Text>
        <T muted small>Отделно от ежедневните разходи. Внасянето в спестовна сметка намалява дневния лимит за периода; плащане от нея не го засяга. Сметката с ★ се показва в „Днес“ и за двама ви.</T>
      </Card>

      {c && pr ? (
        <Card highlight={def === pool.id}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <WalletIcon color={catColor(t, pool.color)} />
            <View style={{ flex: 1 }}>
              <H2>{pool.name}</H2>
              <Text style={[{ color: t.ink, fontSize: 24, fontWeight: '800' }, NUM]}>{eur(pr.remainingCents)}</Text>
              <T muted small>остават до {dLabel(c.end)} · приходи този период {eur0(pr.incomeCents)}</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Btn variant="primary" title="Добави приход" onPress={() => nav.openSheet({ mode: 'income' })} />
            <Btn title="Добави разход" onPress={() => nav.openSheet({ mode: 'expense', source: null })} />
            <DefaultControl id={pool.id} name={pool.name} />
            <Btn title="✎ Промени" onPress={() => setEditing(editing === pool.id ? null : pool.id)} />
          </View>
          {editing === pool.id ? <EditFund b={pool} isPool balance={pr.remainingCents} onDone={() => setEditing(null)} /> : null}
        </Card>
      ) : null}

      {bs.map(b => {
        const bal = bucketBalance(m, b.id);
        const pct = b.targetCents ? Math.max(0, Math.min(1, bal / b.targetCents)) : null;
        const moves = m.txs.filter(x => x.bucketId === b.id).sort(txSort);
        const inCyc = c ? moves.filter(x => inCycle(x, c)).reduce((a, x) => a + (x.kind === 'bucket_deposit' ? x.amountCents : -x.amountCents), 0) : 0;
        const isOpen = open === b.id;
        return (
          <Card key={b.id} highlight={def === b.id}>
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
              <Ring t={t} pct={pct} color={catColor(t, b.color)} />
              <View style={{ flex: 1 }}>
                <H2>{b.name}</H2>
                <Text style={[{ color: t.ink, fontSize: 24, fontWeight: '800' }, NUM]}>{eur(bal)}</Text>
                <T muted small>{b.targetCents ? `Цел ${eur0(b.targetCents)}${b.targetDate ? ' до ' + dLabel(b.targetDate) : ''} · ` : ''}{inCyc >= 0 ? '+' : '−'}{eur0(Math.abs(inCyc))} този период</T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Btn variant="primary" title="Внеси" onPress={() => nav.openSheet({ mode: 'transfer', bucketId: b.id, direction: 'to_bucket' })} />
              <Btn title="Изтегли" onPress={() => nav.openSheet({ mode: 'transfer', bucketId: b.id, direction: 'from_bucket' })} />
              <Btn title="Плати от него" onPress={() => nav.openSheet({ mode: 'expense', source: b.id })} />
              <DefaultControl id={b.id} name={b.name} />
              <Btn title="✎ Промени" onPress={() => setEditing(editing === b.id ? null : b.id)} />
            </View>
            {editing === b.id ? <EditFund b={b} balance={bal} onDone={() => setEditing(null)} /> : null}
            <Btn variant="link" title={isOpen ? 'Скрий историята' : `История (${moves.length})`} onPress={() => setOpen(isOpen ? null : b.id)} style={{ alignSelf: 'flex-start' }} />
            {isOpen ? (moves.length ? moves.slice(0, 15).map((x, i) => <TxRow key={x.id} m={m} tx={x} first={i === 0} onPress={() => nav.openSheet({ editId: x.id })} />)
              : <T muted small>Още няма движения.</T>) : null}
          </Card>
        );
      })}

      <Card>
        {!adding ? (
          <Btn variant="accentOutline" block title="+ Нова сметка" onPress={() => { setAdding(true); setNewErr(''); }} />
        ) : (
          <>
            <H2>Нова сметка</H2>
            <Field label="Име"><Input value={newName} onChangeText={setNewName} placeholder="Напр. Ваканция, Ремонт" autoFocus /></Field>
            <Field label="Цел в € (по избор)"><Input value={newTarget} onChangeText={setNewTarget} keyboardType="decimal-pad" placeholder="Напр. 1500" /></Field>
            {newErr ? <T small style={{ color: t.bad }}>{newErr}</T> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn variant="primary" title="Създай сметка" onPress={async () => {
                const name = newName.trim();
                if (!name) return setNewErr('Въведете име на сметката.');
                if (m.buckets.some(b => !b.archived && b.name.toLowerCase() === name.toLowerCase())) return setNewErr('Вече има сметка с това име.');
                const target = newTarget.trim() ? Engine.parseAmountToCents(newTarget) : null;
                if (newTarget.trim() && !target) return setNewErr('Проверете сумата за целта, например 1500 или 1500,50.');
                await addBucket(name, target);
                setAdding(false); setNewName(''); setNewTarget(''); setNewErr('');
                toast(`Сметката „${name}“ е създадена`);
              }} />
              <Btn title="Отказ" onPress={() => { setAdding(false); setNewErr(''); }} />
            </View>
          </>
        )}
      </Card>
    </Screen>
  );
}

/** Rename a fund, change its target, or delete it (its old records stay in the history). */
function EditFund({ b, isPool, balance, onDone }: { b: Bucket; isPool?: boolean; balance: number; onDone: () => void }) {
  const t = useTheme(); const toast = useToast();
  const s = useStore(); const m = s.model;
  const [name, setName] = useState(b.name);
  const [target, setTarget] = useState(b.targetCents ? (b.targetCents / 100).toFixed(2).replace('.', ',') : '');
  const [arm, setArm] = useState(false);
  const [err, setErr] = useState('');
  const [color, setColor] = useState(b.color);
  async function save() {
    const n = name.trim(); if (!n) return setErr('Въведете име.');
    if (m.buckets.some(x => x.id !== b.id && !x.archived && x.name.toLowerCase() === n.toLowerCase())) return setErr('Вече има сметка с това име.');
    const tc = target.trim() ? Engine.parseAmountToCents(target) : null;
    if (target.trim() && !tc) return setErr('Проверете сумата за целта.');
    await s.updateBucket(b.id, isPool ? { name: n, color } : { name: n, targetCents: tc, color });
    toast('Промените са записани'); onDone();
  }
  async function remove() {
    if (!arm) return setArm(true);
    if (balance > 0) {
      // move what's left back to the salaries fund first, so no money disappears with the fund
      await s.saveTx({ kind: 'bucket_withdrawal', amountCents: balance, occurredOn: today(), categoryId: null, bucketId: b.id, paidBy: null, note: `Закриване на „${b.name}“` });
    }
    await s.updateBucket(b.id, { archived: true });
    toast(`Сметката „${b.name}“ е изтрита`); onDone();
  }
  return (
    <View style={{ gap: 8, backgroundColor: t.accentSoft, borderRadius: 12, padding: 12 }}>
      <Field label="Име"><Input value={name} onChangeText={setName} /></Field>
      {!isPool ? <Field label="Цел в € (по избор)"><Input value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="Без цел" /></Field> : null}
      <Field label="Цвят"><ColorPicker value={color} onChange={setColor} /></Field>
      {err ? <T small style={{ color: t.bad }}>{err}</T> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Btn variant="primary" title="Запази" onPress={save} />
        <Btn title="Отказ" onPress={onDone} />
        {!isPool ? <Btn variant={arm ? 'dangerSolid' : 'danger'} title={arm ? 'Натиснете отново за изтриване' : 'Изтрий сметката'} onPress={remove} /> : null}
      </View>
      {arm && balance > 0 ? <T small style={{ color: t.bad }}>Наличността {eur(balance)} ще бъде върната в общия бюджет, след което сметката ще бъде изтрита.</T> : null}
    </View>
  );
}

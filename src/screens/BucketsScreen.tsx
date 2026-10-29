import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { bucketBalance, computePool, currentCycle, defaultFundId, inCycle, poolOf, savingsOf, txSort } from '../data/derive';
import { useStore } from '../data/store';
import { dLabel, eur, eur0 } from '../lib/format';
import { catColor, useTheme } from '../lib/theme';
import { Ring, WalletIcon } from '../ui/charts';
import { Btn, Card, Field, H2, Input, Label, NUM, Screen, T, useToast } from '../ui/kit';
import * as Engine from '../engine/budgetEngine';
import { TxRow, useNav } from '../ui/nav';

export default function BucketsScreen() {
  const t = useTheme(); const nav = useNav(); const toast = useToast();
  const { model: m, updateSettings, addBucket } = useStore();
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
    ? <View style={{ backgroundColor: t.accentSoft, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}><Text style={{ color: t.accent, fontWeight: '800', fontSize: 13.5 }}>★ Основен</Text></View>
    : <Btn variant="accentOutline" title="☆ Направи основен" onPress={async () => { await updateSettings({ defaultFund: id }); toast(`„${name}“ е основният фонд`); }} />;

  return (
    <Screen>
      <Card style={{ borderRadius: 18 }}>
        <Label>Общо в спестовните фондове</Label>
        <Text adjustsFontSizeToFit numberOfLines={1} style={[{ color: t.ink, fontSize: 44, fontWeight: '800', letterSpacing: -1.2 }, NUM]}>{eur(total)}</Text>
        <T muted small>Отделно от ежедневните разходи. Внасянето във фонд намалява дневния лимит за периода; плащане от фонд не го засяга. Фондът с ★ се показва в „Днес“ и за двама ви.</T>
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
          </View>
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
            </View>
            <Btn variant="link" title={isOpen ? 'Скрий историята' : `История (${moves.length})`} onPress={() => setOpen(isOpen ? null : b.id)} style={{ alignSelf: 'flex-start' }} />
            {isOpen ? (moves.length ? moves.slice(0, 15).map((x, i) => <TxRow key={x.id} m={m} tx={x} first={i === 0} onPress={() => nav.openSheet({ editId: x.id })} />)
              : <T muted small>Още няма движения.</T>) : null}
          </Card>
        );
      })}

      <Card>
        {!adding ? (
          <Btn variant="accentOutline" block title="+ Нов фонд" onPress={() => { setAdding(true); setNewErr(''); }} />
        ) : (
          <>
            <H2>Нов фонд</H2>
            <Field label="Име"><Input value={newName} onChangeText={setNewName} placeholder="Напр. Ваканция, Ремонт" autoFocus /></Field>
            <Field label="Цел в € (по избор)"><Input value={newTarget} onChangeText={setNewTarget} keyboardType="decimal-pad" placeholder="Напр. 1500" /></Field>
            {newErr ? <T small style={{ color: t.bad }}>{newErr}</T> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn variant="primary" title="Създай фонд" onPress={async () => {
                const name = newName.trim();
                if (!name) return setNewErr('Въведете име на фонда.');
                if (m.buckets.some(b => !b.archived && b.name.toLowerCase() === name.toLowerCase())) return setNewErr('Вече има фонд с това име.');
                const target = newTarget.trim() ? Engine.parseAmountToCents(newTarget) : null;
                if (newTarget.trim() && !target) return setNewErr('Проверете сумата за целта, например 1500 или 1500,50.');
                await addBucket(name, target);
                setAdding(false); setNewName(''); setNewTarget(''); setNewErr('');
                toast(`Фондът „${name}“ е създаден`);
              }} />
              <Btn title="Отказ" onPress={() => { setAdding(false); setNewErr(''); }} />
            </View>
          </>
        )}
      </Card>
    </Screen>
  );
}

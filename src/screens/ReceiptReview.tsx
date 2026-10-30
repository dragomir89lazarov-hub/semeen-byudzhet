// Approval step after a receipt or screenshot was read: one line per product with a suggested
// category. Nothing is saved until the user taps "Одобри".
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Engine from '../engine/budgetEngine';
import { groupByCategory, type Receipt } from '../engine/receipt';
import { activeCats, bucketBalance, bucketOf, defaultFundId, isPoolId, poolOf, savingsOf, today } from '../data/derive';
import { useStore } from '../data/store';
import { dLabel, eur } from '../lib/format';
import { catColor, useTheme } from '../lib/theme';
import DateButton from '../ui/DateButton';
import { Btn, Check, Chip, Chips, Field, H2, NUM, Row, T, useToast } from '../ui/kit';

interface Line { key: string; name: string; amount: string; categoryId: string | null; newCategory: string | null; removed: boolean }
const centsText = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export default function ReceiptReview({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  const t = useTheme(); const toast = useToast();
  const s = useStore(); const m = s.model;
  const cats = activeCats(m); const bks = savingsOf(m); const people = m.settings.people;
  const fid = defaultFundId(m);

  const [lines, setLines] = useState<Line[]>([]);
  const [store, setStore] = useState('');
  const [date, setDate] = useState(today());
  const [source, setSource] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState(people[0]);
  const [group, setGroup] = useState(false);
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!receipt) return;
    setLines(receipt.lines.map(l => ({ key: l.key, name: l.name, amount: centsText(l.amountCents), categoryId: l.categoryId, newCategory: l.newCategory, removed: false })));
    setStore(receipt.store); setDate(receipt.date && receipt.date <= today() ? receipt.date : today());
    setSource(isPoolId(m, fid) ? null : fid); setPaidBy(people[0]); setGroup(false); setOpenPicker(null); setError(''); setBusy(false);
  }, [receipt]);

  const kept = lines.filter(l => !l.removed);
  const parsed = kept.map(l => ({ ...l, cents: Engine.parseAmountToCents(l.amount) }));
  const total = parsed.reduce((a, l) => a + (l.cents || 0), 0);
  const mismatch = receipt?.totalCents != null && Math.abs(total - receipt.totalCents) > 1;
  // new categories the AI suggested (and that the user still uses)
  const suggestions = useMemo(() => [...new Set(lines.map(l => l.newCategory).filter((x): x is string => !!x))]
    .filter(n => !cats.some(k => k.name.toLowerCase() === n.toLowerCase())), [lines, cats]);

  const update = (key: string, patch: Partial<Line>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));

  async function approve() {
    setError('');
    if (!kept.length) return setError('Няма останали редове за записване.');
    if (parsed.some(l => !l.cents)) return setError('Проверете сумите: всяка трябва да е число, например 2,49.');
    if (parsed.some(l => !l.categoryId && !l.newCategory)) return setError('Изберете категория за всеки ред.');
    if (source) {
      const bal = bucketBalance(m, source);
      if (total > bal) return setError(`„${bucketOf(m, source)?.name}“ разполага само с ${eur(bal)}.`);
    }
    setBusy(true);
    // create the new categories the user kept, then map lines to real ids
    const ids = new Map<string, string>();
    for (const l of parsed) {
      if (l.categoryId || !l.newCategory || ids.has(l.newCategory)) continue;
      const existing = cats.find(k => k.name.toLowerCase() === l.newCategory!.toLowerCase());
      ids.set(l.newCategory, existing ? existing.id : await s.addCategory(l.newCategory, false));
    }
    const ready = parsed.map(l => ({ key: l.key, name: l.name, amountCents: l.cents!, categoryId: l.categoryId || ids.get(l.newCategory!)!, newCategory: null }));
    const prefix = store.trim();
    let count = 0;
    if (group) {
      for (const g of groupByCategory(ready)) {
        const note = `${prefix ? prefix + ': ' : ''}${g.names.join(', ')}`.slice(0, 200);
        await s.saveTx({ kind: 'expense', amountCents: g.amountCents, occurredOn: date, categoryId: g.categoryKey, bucketId: source, paidBy, note });
        count++;
      }
    } else {
      for (const l of ready) {
        await s.saveTx({ kind: 'expense', amountCents: l.amountCents, occurredOn: date, categoryId: l.categoryId, bucketId: source, paidBy, note: `${prefix ? prefix + ' · ' : ''}${l.name}`.slice(0, 200) });
        count++;
      }
    }
    setBusy(false);
    onClose();
    toast(`Добавени ${count} ${count === 1 ? 'разход' : 'разхода'} · ${eur(total)}`);
  }

  const catName = (l: Line) => (l.categoryId ? cats.find(k => k.id === l.categoryId)?.name : l.newCategory ? `+ ${l.newCategory} (нова)` : 'Изберете категория');
  const catCol = (l: Line) => (l.categoryId ? catColor(t, cats.find(k => k.id === l.categoryId)?.color) : t.accent);

  return (
    <Modal visible={!!receipt} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,12,18,0.45)' }}>
        <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '96%' }}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 34, gap: 14 }} keyboardShouldPersistTaps="handled">
            <View style={{ width: 40, height: 4, borderRadius: 4, backgroundColor: t.line, alignSelf: 'center' }} />
            <Row><H2>Проверете разчетеното</H2><Btn variant="link" title="Отказ" onPress={onClose} /></Row>
            <T>
              Прочетох {kept.length} {kept.length === 1 ? 'продукт' : 'продукта'}{store ? ` от ${store}` : ''}{receipt?.date ? `, ${dLabel(receipt.date)}` : ''}.
              Мисля, че попадат в тези категории — коригирайте каквото трябва и натиснете „Одобри“.
            </T>

            <View style={{ gap: 0 }}>
              {lines.map((l, i) => (
                <View key={l.key} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, gap: 8, opacity: l.removed ? 0.45 : 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput value={l.name} onChangeText={v => update(l.key, { name: v })} editable={!l.removed}
                      style={{ flex: 1, color: t.ink, fontSize: 15, fontWeight: '500', padding: 0, textDecorationLine: l.removed ? 'line-through' : 'none' }} />
                    <TextInput value={l.amount} onChangeText={v => update(l.key, { amount: v })} keyboardType="decimal-pad" editable={!l.removed}
                      style={[{ width: 76, textAlign: 'right', color: t.ink, fontSize: 15, fontWeight: '700', padding: 0 }, NUM]} />
                    <Text style={{ color: t.ink2 }}>€</Text>
                    <Pressable onPress={() => update(l.key, { removed: !l.removed })} hitSlop={8} accessibilityLabel={l.removed ? 'Върни реда' : 'Премахни реда'}>
                      <Text style={{ color: l.removed ? t.accent : t.ink2, fontSize: 16, fontWeight: '700', paddingHorizontal: 4 }}>{l.removed ? '↺' : '✕'}</Text>
                    </Pressable>
                  </View>
                  {!l.removed ? (
                    <Pressable onPress={() => setOpenPicker(openPicker === l.key ? null : l.key)}
                      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: l.categoryId || l.newCategory ? catCol(l) : t.bad, backgroundColor: t.bg }}>
                      <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: catCol(l) }} />
                      <Text style={{ color: t.ink, fontSize: 13 }}>{catName(l)}</Text>
                      <Text style={{ color: t.ink2, fontSize: 11 }}>▾</Text>
                    </Pressable>
                  ) : null}
                  {openPicker === l.key && !l.removed ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {cats.map(k => <Chip key={k.id} label={k.name} selected={l.categoryId === k.id} onPress={() => { update(l.key, { categoryId: k.id, newCategory: null }); setOpenPicker(null); }} />)}
                      {suggestions.map(n => <Chip key={'n' + n} label={`+ ${n}`} selected={!l.categoryId && l.newCategory === n} onPress={() => { update(l.key, { categoryId: null, newCategory: n }); setOpenPicker(null); }} />)}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>

            <View style={{ backgroundColor: mismatch ? t.warnSoft : t.bg, borderRadius: 12, padding: 12, gap: 2 }}>
              <Row><T bold>Общо за записване</T><Text style={[{ color: t.ink, fontWeight: '800', fontSize: 17 }, NUM]}>{eur(total)}</Text></Row>
              {receipt?.totalCents != null ? (
                <T small style={{ color: mismatch ? t.warn : t.ink2 }}>
                  {mismatch ? `Сумата на бележката е ${eur(receipt.totalCents)} — проверете дали някой ред липсва или е грешен.` : `Съвпада със сумата на бележката (${eur(receipt.totalCents)}).`}
                </T>
              ) : null}
            </View>

            <Field label="Магазин"><TextInput value={store} onChangeText={setStore} placeholder="Напр. Лидл" placeholderTextColor={t.ink2}
              style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.bg, color: t.ink, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15 }} /></Field>
            <Field label="Дата"><DateButton value={date} onChange={setDate} /></Field>
            <Field label="Платено от">
              <Chips>
                <Chip label={poolOf(m).name} selected={!source} onPress={() => setSource(null)} />
                {bks.map(b => <Chip key={b.id} label={b.name} selected={source === b.id} onPress={() => setSource(b.id)} />)}
              </Chips>
            </Field>
            <Field label="Платил"><Chips>{people.map(p => <Chip key={p} label={p} selected={paidBy === p} onPress={() => setPaidBy(p)} />)}</Chips></Field>
            <Check label="Обедини по категории (един разход на категория)" value={group} onChange={setGroup} />

            {error ? <T small style={{ color: t.bad }}>{error}</T> : null}
            <Btn variant="primary" block disabled={busy} title={busy ? 'Записване…' : `Одобри и добави ${group ? groupByCategory(parsed.filter(l => l.cents).map(l => ({ key: l.key, name: l.name, amountCents: l.cents!, categoryId: l.categoryId, newCategory: l.newCategory }))).length : kept.length} ${group ? 'разхода' : kept.length === 1 ? 'разход' : 'разхода'}`} onPress={approve} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}


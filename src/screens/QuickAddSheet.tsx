import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Engine from '../engine/budgetEngine';
import { activeCats, bucketBalance, bucketOf, defaultFundId, isPoolId, poolOf, savingsOf, today } from '../data/derive';
import { useStore } from '../data/store';
import type { Tx } from '../data/types';
import { dLabel, eur } from '../lib/format';
import { catColor, useTheme } from '../lib/theme';
import DateButton from '../ui/DateButton';
import { Btn, Check, Chip, Chips, Field, H2, Input, Row, T, useToast } from '../ui/kit';
import { SheetInit, txMeta } from '../ui/nav';
import type { Receipt } from '../engine/receipt';
import { readReceiptImage } from '../lib/receiptReader';

type Mode = 'expense' | 'income' | 'transfer';
let lastCat: string | null = null;
let lastPayer: string | null = null;

export default function QuickAddSheet({ init, onClose, onReceipt }: { init: SheetInit | null; onClose: () => void; onReceipt: (r: Receipt) => void }) {
  const t = useTheme(); const toast = useToast();
  const s = useStore(); const m = s.model;
  const editing = init?.editId ? m.txs.find(x => x.id === init.editId) || null : null;
  const fid = defaultFundId(m);
  const cats = activeCats(m); const bks = savingsOf(m); const people = m.settings.people;

  const [mode, setMode] = useState<Mode>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [bucketId, setBucketId] = useState<string | null>(null);
  const [direction, setDirection] = useState<'to_bucket' | 'from_bucket'>('to_bucket');
  const [date, setDate] = useState(today());
  const [paidBy, setPaidBy] = useState(people[0]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<Tx | null>(null);
  const [armDelete, setArmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [newCat, setNewCat] = useState(false); const [newCatName, setNewCatName] = useState(''); const [newCatFixed, setNewCatFixed] = useState(false); const [newCatErr, setNewCatErr] = useState('');
  const baseVersion = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!init) return;
    setError(''); setConflict(null); setArmDelete(false); setNewCat(false); setNewCatName(''); setNewCatErr(''); setBusy(false); setReading(false);
    if (editing) {
      setMode(editing.kind === 'income' ? 'income' : editing.kind === 'expense' ? 'expense' : 'transfer');
      setAmount((editing.amountCents / 100).toFixed(2).replace('.', ','));
      setCategoryId(editing.categoryId); setSource(editing.kind === 'expense' ? editing.bucketId : null);
      setBucketId(editing.kind !== 'expense' ? editing.bucketId : null); setDirection(editing.kind === 'bucket_withdrawal' ? 'from_bucket' : 'to_bucket');
      setDate(editing.occurredOn); setPaidBy(editing.paidBy || people[0]); setNote(editing.note); baseVersion.current = editing.version;
    } else {
      setMode(init.mode || 'expense'); setAmount('');
      setCategoryId(lastCat && cats.some(k => k.id === lastCat) ? lastCat : cats[0]?.id || null);
      setSource(init.source !== undefined ? init.source : isPoolId(m, fid) ? null : fid);
      setBucketId(init.bucketId || (isPoolId(m, fid) ? bks[0]?.id : fid) || null);
      setDirection(init.direction || 'to_bucket'); setDate(today());
      setPaidBy(lastPayer && people.includes(lastPayer) ? lastPayer : people[0]); setNote(''); baseVersion.current = undefined;
    }
  }, [init]);

  async function addInlineCategory() {
    const name = newCatName.trim();
    if (!name) return setNewCatErr('Въведете име.');
    const existing = m.categories.find(k => !k.archived && k.name.toLowerCase() === name.toLowerCase());
    if (existing) { setCategoryId(existing.id); setNewCat(false); setNewCatName(''); return; }
    const id = await s.addCategory(name, newCatFixed);
    setCategoryId(id); setNewCat(false); setNewCatName(''); setNewCatFixed(false); setNewCatErr('');
    toast('Видът е добавен');
  }

  async function save(force = false) {
    setError('');
    const cents = Engine.parseAmountToCents(amount);
    if (!cents) return setError('Въведете сума, например 12,50.');
    const others = { ...m, txs: m.txs.filter(x => x.id !== editing?.id) };
    let kind: Tx['kind'] = 'expense', cat: string | null = null, bucket: string | null = null, who: string | null = null;
    if (mode === 'expense') {
      if (!categoryId) return setError('Изберете вид разход.');
      cat = categoryId; bucket = source; who = paidBy;
      if (source && !force) {
        const bal = bucketBalance(others, source);
        if (cents > bal) return setError(`„${bucketOf(m, source)?.name}“ разполага само с ${eur(bal)}.`);
      }
    } else if (mode === 'income') { kind = 'income'; who = paidBy; }
    else {
      if (!bucketId) return setError('Изберете фонд.');
      kind = direction === 'to_bucket' ? 'bucket_deposit' : 'bucket_withdrawal'; bucket = bucketId;
      if (direction === 'from_bucket') {
        const bal = bucketBalance(others, bucketId);
        if (cents > bal) return setError(`„${bucketOf(m, bucketId)?.name}“ разполага само с ${eur(bal)}.`);
      }
    }
    setBusy(true);
    const r = await s.saveTx({ id: editing?.id, kind, amountCents: cents, occurredOn: date, categoryId: cat, bucketId: bucket, paidBy: who, note: note.trim() },
      editing ? { version: baseVersion.current ?? editing.version, force } : undefined);
    setBusy(false);
    if ('conflict' in r) { setConflict(r.conflict); return; }
    if ('error' in r) { setError(r.error); return; }
    if (mode === 'expense') lastCat = cat;
    lastPayer = who;
    onClose(); toast(editing ? 'Промените са записани' : 'Записано');
  }
  async function scan(source: 'camera' | 'gallery') {
    setError('');
    const r = await readReceiptImage(source, cats.map(k => ({ id: k.id, name: k.name })), today(), () => setReading(true));
    setReading(false);
    if (r.ok) { onReceipt(r.receipt); return; }
    if ('message' in r) setError(r.message);
  }

  async function remove() {
    if (!armDelete) return setArmDelete(true);
    await s.deleteTx(editing!.id); onClose(); toast('Изтрито');
  }

  const visible = !!init;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,12,18,0.45)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Затвори" />
        <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%' }}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 34, gap: 14 }} keyboardShouldPersistTaps="handled">
            <View style={{ width: 40, height: 4, borderRadius: 4, backgroundColor: t.line, alignSelf: 'center' }} />
            <Row><H2>{editing ? 'Редакция на запис' : 'Нов запис'}</H2><Btn variant="link" title="Отказ" onPress={onClose} /></Row>

            {!editing ? (
              <View style={{ flexDirection: 'row', backgroundColor: t.sunk, borderRadius: 12, padding: 3, gap: 3 }}>
                {([['expense', 'Разход'], ['income', 'Приход'], ['transfer', 'Фонд']] as [Mode, string][]).map(([k, l]) => (
                  <Pressable key={k} onPress={() => { setMode(k); setError(''); }} style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: mode === k ? t.surface : 'transparent' }}>
                    <Text style={{ fontWeight: '700', color: mode === k ? t.ink : t.ink2 }}>{l}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={t.line}
                autoFocus={!editing} accessibilityLabel="Сума в евро" onSubmitEditing={() => save()}
                style={{ fontSize: 46, fontWeight: '800', color: t.ink, minWidth: 140, textAlign: 'right', padding: 0 }} />
              <Text style={{ fontSize: 30, color: t.ink2 }}>€</Text>
            </View>

            {mode === 'expense' && !editing ? (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn style={{ flex: 1 }} variant="accentOutline" title="📷 Снимай бележка" disabled={reading} onPress={() => scan('camera')} />
                  <Btn style={{ flex: 1 }} variant="accentOutline" title="🖼 От галерията" disabled={reading} onPress={() => scan('gallery')} />
                </View>
                <T muted small>{reading ? 'Разчитане на изображението… обикновено 5–15 секунди.' : 'Касова бележка или снимка на екрана от онлайн поръчка: продуктите се разделят по категории за одобрение.'}</T>
              </View>
            ) : null}

            {mode === 'expense' ? (
              <>
                <Field label="Вид разход">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {cats.map(k => {
                      const on = categoryId === k.id;
                      return (
                        <Pressable key={k.id} onPress={() => setCategoryId(k.id)} style={{ width: '31.5%', borderWidth: on ? 2 : 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accentSoft : t.bg, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 14, height: 14, borderRadius: 5, backgroundColor: catColor(t, k.color) }} />
                          <Text numberOfLines={2} style={{ color: t.ink, fontSize: 12.5, textAlign: 'center' }}>{k.name}</Text>
                        </Pressable>
                      );
                    })}
                    {!newCat ? (
                      <Pressable onPress={() => setNewCat(true)} style={{ width: '31.5%', borderWidth: 1, borderStyle: 'dashed', borderColor: t.accent, borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: t.accent, fontSize: 20, fontWeight: '700', lineHeight: 20 }}>+</Text>
                        <Text style={{ color: t.accent, fontSize: 12.5, fontWeight: '600' }}>Нов вид</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Field>
                {newCat ? (
                  <View style={{ backgroundColor: t.accentSoft, borderRadius: 12, padding: 12, gap: 8 }}>
                    <Field label="Нов вид разход">
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Input style={{ flex: 1 }} autoFocus placeholder="Напр. Аптека, Подаръци" value={newCatName} onChangeText={setNewCatName} onSubmitEditing={addInlineCategory} />
                        <Btn variant="primary" title="Добави" onPress={addInlineCategory} />
                      </View>
                    </Field>
                    <Row><Check label="Фиксирана сметка" value={newCatFixed} onChange={setNewCatFixed} /><Btn variant="link" title="Отказ" onPress={() => { setNewCat(false); setNewCatName(''); setNewCatErr(''); }} /></Row>
                    {newCatErr ? <T small style={{ color: t.bad }}>{newCatErr}</T> : null}
                  </View>
                ) : null}
                <Field label="Платено от">
                  <Chips>
                    <Chip label={poolOf(m).name} selected={!source} onPress={() => setSource(null)} />
                    {bks.map(b => <Chip key={b.id} label={b.name} selected={source === b.id} onPress={() => setSource(b.id)} />)}
                  </Chips>
                </Field>
                <Field label="Плати"><Chips>{people.map(p => <Chip key={p} label={p} selected={paidBy === p} onPress={() => setPaidBy(p)} />)}</Chips></Field>
              </>
            ) : mode === 'income' ? (
              <>
                <Field label="Чий приход"><Chips>{[...people, 'Друг'].map(p => <Chip key={p} label={p} selected={paidBy === p} onPress={() => setPaidBy(p)} />)}</Chips></Field>
                <T muted small>Приходите отиват в „{poolOf(m).name}“.</T>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', backgroundColor: t.sunk, borderRadius: 12, padding: 3, gap: 3 }}>
                  {([['to_bucket', 'Към фонд'], ['from_bucket', 'Обратно към общия бюджет']] as const).map(([k, l]) => (
                    <Pressable key={k} onPress={() => setDirection(k)} style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: direction === k ? t.surface : 'transparent' }}>
                      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: '700', color: direction === k ? t.ink : t.ink2 }}>{l}</Text>
                    </Pressable>
                  ))}
                </View>
                <Field label="Фонд"><Chips>{bks.map(b => <Chip key={b.id} label={b.name} selected={bucketId === b.id} onPress={() => setBucketId(b.id)} />)}</Chips></Field>
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Дата"><DateButton value={date} onChange={setDate} /></Field>
              <Field label="Бележка"><Input value={note} onChangeText={setNote} placeholder={mode === 'expense' ? 'Лидл, екскурзия…' : 'По избор'} /></Field>
            </View>

            {conflict ? (
              <View style={{ backgroundColor: t.accentSoft, borderRadius: 12, padding: 12, gap: 8 }}>
                <T small>Този запис беше променен на другия телефон, докато го редактирахте. Сега е: <Text style={{ fontWeight: '700' }}>{eur(conflict.amountCents)} · {txMeta(m, conflict, t.cats).title} · {dLabel(conflict.occurredOn)}</Text>.</T>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn variant="primary" title="Запази моята версия" onPress={() => { baseVersion.current = conflict.version; setConflict(null); save(true); }} />
                  <Btn title="Остави тяхната" onPress={onClose} />
                </View>
              </View>
            ) : null}
            {error ? <T small style={{ color: t.bad }}>{error}</T> : null}
            <Btn variant="primary" block disabled={busy} title={editing ? 'Запази промените' : 'Запази'} onPress={() => save()} />
            {editing ? <Btn block variant={armDelete ? 'dangerSolid' : 'danger'} title={armDelete ? 'Натиснете отново за изтриване' : 'Изтрий записа'} onPress={remove} /> : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

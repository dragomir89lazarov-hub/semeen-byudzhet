// Settings → "Категории и групи": the full list of expense types, grouped. Tap a category to
// rename it, put it in a group (or a new one), or delete it. Tap a group to rename or dissolve it.
// Groups only change how statistics are shown; every expense keeps its own category.
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { activeCats, groupNames } from '../data/derive';
import { useStore } from '../data/store';
import type { Category } from '../data/types';
import { catColor, useTheme } from '../lib/theme';
import { Btn, Chip, H2, Input, T, useToast } from '../ui/kit';

export default function CategoryManager() {
  const t = useTheme(); const toast = useToast();
  const s = useStore(); const m = s.model;
  const cats = activeCats(m);
  const groups = groupNames(m);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState<string | null>(null); // text while creating a group
  const [arm, setArm] = useState(false);
  const [editGroup, setEditGroup] = useState<string | null>(null);
  const [groupText, setGroupText] = useState('');

  const open = (k: Category) => { setEditId(k.id); setName(k.name); setGroup(k.group); setNewGroup(null); setArm(false); setEditGroup(null); };

  async function save(k: Category) {
    const n = name.trim(); if (!n) return toast('Въведете име.');
    if (m.categories.some(x => x.id !== k.id && x.name.toLowerCase() === n.toLowerCase())) return toast('Вече има категория с това име.');
    const g = newGroup !== null ? newGroup.trim() || null : group;
    await s.updateCategory(k.id, { name: n, group: g });
    setEditId(null); toast('Записано');
  }

  const catRow = (k: Category, indent: boolean) => editId === k.id ? (
    <View key={k.id} style={{ gap: 10, backgroundColor: t.accentSoft, borderRadius: 12, padding: 12, marginLeft: indent ? 14 : 0 }}>
      <Input value={name} onChangeText={setName} autoFocus />
      <Text style={{ color: t.ink2, fontSize: 13, fontWeight: '600' }}>Група</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip label="Без група" selected={newGroup === null && !group} onPress={() => { setGroup(null); setNewGroup(null); }} />
        {groups.map(g => <Chip key={g} label={g} selected={newGroup === null && group === g} onPress={() => { setGroup(g); setNewGroup(null); }} />)}
        <Chip label="+ Нова група" selected={newGroup !== null} onPress={() => setNewGroup('')} />
      </View>
      {newGroup !== null ? <Input value={newGroup} onChangeText={setNewGroup} placeholder="Напр. Храна, Дом, Деца" autoFocus /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Btn variant="primary" title="Запази" onPress={() => save(k)} />
        <Btn title="Отказ" onPress={() => setEditId(null)} />
        <Btn variant={arm ? 'dangerSolid' : 'danger'} title={arm ? 'Натиснете отново за изтриване' : 'Изтрий'} onPress={async () => {
          if (!arm) return setArm(true);
          await s.updateCategory(k.id, { archived: true }); setEditId(null); toast(`„${k.name}“ е изтрита`);
        }} />
      </View>
    </View>
  ) : (
    <Pressable key={k.id} onPress={() => open(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, marginLeft: indent ? 14 : 0 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: catColor(t, k.color) }} />
      <Text numberOfLines={1} style={{ flex: 1, color: t.ink }}>{k.name}</Text>
      <Text style={{ color: t.ink2 }}>✎</Text>
    </Pressable>
  );

  const ungrouped = cats.filter(k => !k.group);
  return (
    <View style={{ gap: 6 }}>
      <H2>Категории и групи</H2>
      <T muted small>Докоснете категория, за да я преименувате, да ѝ изберете група (напр. „Храна“ за „Хранителни продукти“ и „Храна за вкъщи“) или да я изтриете. В статистиките превключвателят „Подробно / Групи“ показва категориите поотделно или обединени по групи.</T>
      {groups.map(g => (
        <View key={g} style={{ gap: 2, paddingTop: 6 }}>
          {editGroup === g ? (
            <View style={{ gap: 8, backgroundColor: t.sunk, borderRadius: 12, padding: 10 }}>
              <Input value={groupText} onChangeText={setGroupText} autoFocus />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Btn variant="primary" title="Преименувай групата" onPress={async () => {
                  const n = groupText.trim(); if (!n) return toast('Въведете име на групата.');
                  await s.renameGroup(g, n); setEditGroup(null); toast('Групата е преименувана');
                }} />
                <Btn title="Отказ" onPress={() => setEditGroup(null)} />
                <Btn variant="danger" title="Разгрупирай" onPress={async () => { await s.renameGroup(g, null); setEditGroup(null); toast(`Групата „${g}“ е премахната`); }} />
              </View>
            </View>
          ) : (
            <Pressable onPress={() => { setEditGroup(g); setGroupText(g); setEditId(null); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
              <Text style={{ flex: 1, color: t.ink, fontWeight: '800', fontSize: 15 }}>{g}</Text>
              <Text style={{ color: t.ink2, fontSize: 12.5 }}>{cats.filter(k => k.group === g).length} кат. ✎</Text>
            </Pressable>
          )}
          {cats.filter(k => k.group === g).map(k => catRow(k, true))}
        </View>
      ))}
      {groups.length ? <Text style={{ color: t.ink2, fontWeight: '700', fontSize: 13, paddingTop: 8 }}>Без група</Text> : null}
      {ungrouped.map(k => catRow(k, false))}
    </View>
  );
}

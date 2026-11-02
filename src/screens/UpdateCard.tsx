// Settings → "Обновления": a large, clear button plus the current version and status in plain words.
import * as Updates from 'expo-updates';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTheme } from '../lib/theme';
import { Card, H2 } from '../ui/kit';

type State = 'idle' | 'checking' | 'downloading' | 'latest' | 'error';

const stamp = (d: Date | null | undefined) => {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function UpdateCard() {
  const t = useTheme();
  const u = Updates.useUpdates();                     // knows when a newer version was already downloaded
  const [state, setState] = useState<State>('idle');
  const pending = u.isUpdatePending;

  async function run() {
    try {
      if (pending) { await Updates.reloadAsync(); return; }
      setState('checking');
      const r = await Updates.checkForUpdateAsync();
      if (!r.isAvailable) { setState('latest'); return; }
      setState('downloading');
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch { setState('error'); }
  }

  const busy = state === 'checking' || state === 'downloading';
  const status = pending ? { text: 'Изтеглена е нова версия. Натиснете бутона, за да я включите.', bg: t.accentSoft, fg: t.accent }
    : state === 'checking' ? { text: 'Проверка за нова версия…', bg: t.sunk, fg: t.ink }
    : state === 'downloading' ? { text: 'Изтегляне на новата версия… Приложението ще се рестартира само.', bg: t.sunk, fg: t.ink }
    : state === 'latest' ? { text: '✓ Имате най-новата версия.', bg: t.goodSoft, fg: t.good }
    : state === 'error' ? { text: 'Няма връзка със сървъра за обновления. Проверете интернета и опитайте отново.', bg: t.badSoft, fg: t.bad }
    : null;
  const label = pending ? '⟳  Рестартирай с новата версия' : busy ? 'Моля, изчакайте…' : '⟳  Провери за обновления';
  const updated = stamp(u.currentlyRunning?.createdAt ?? Updates.createdAt);

  return (
    <Card>
      <H2>Обновления</H2>
      <Pressable onPress={run} disabled={busy} accessibilityRole="button"
        style={({ pressed }) => ({ backgroundColor: t.accent, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: busy ? 0.75 : pressed ? 0.85 : 1 })}>
        {busy ? <ActivityIndicator color={t.accentInk} /> : null}
        <Text style={{ color: t.accentInk, fontSize: 17, fontWeight: '800' }}>{label}</Text>
      </Pressable>
      {status ? (
        <View style={{ backgroundColor: status.bg, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: status.fg, fontSize: 15, fontWeight: '600' }}>{status.text}</Text>
        </View>
      ) : null}
      <View style={{ gap: 4 }}>
        <Text style={{ color: t.ink, fontSize: 15 }}>Версия: <Text style={{ fontWeight: '700' }}>{Updates.runtimeVersion || '—'}</Text></Text>
        {updated ? <Text style={{ color: t.ink, fontSize: 15 }}>Последно обновление: <Text style={{ fontWeight: '700' }}>{updated}</Text></Text> : null}
        <Text style={{ color: t.ink2, fontSize: 13.5 }}>Обновленията се изтеглят и сами при отваряне на приложението и се включват при следващото му отваряне.</Text>
      </View>
    </Card>
  );
}

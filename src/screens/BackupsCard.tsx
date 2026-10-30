// Settings → "Резервни копия": the household's snapshots in the database. One is made
// automatically each day, and before every reset or restore; more can be made by hand.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useStore, type BackupInfo } from '../data/store';
import { useTheme } from '../lib/theme';
import { Btn, Card, H2, NUM, T, useToast } from '../ui/kit';

const KIND: Record<BackupInfo['kind'], string> = {
  manual: 'Ръчно', auto: 'Автоматично', before_reset: 'Преди изчистване', before_restore: 'Преди възстановяване',
};
const when = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function BackupsCard() {
  const t = useTheme(); const toast = useToast(); const s = useStore();
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const load = () => s.listBackups().then(setList);
  useEffect(() => { load(); }, []);

  const shown = (list || []).slice(0, more ? 40 : 6);
  return (
    <Card>
      <H2>Резервни копия</H2>
      <T muted small>Данните ви се пазят в облака: при нов или счупен телефон просто влезте със същия имейл. Копията тук ви пазят от грешки (изтриване, изчистване). Всеки ден се прави едно автоматично копие, както и преди всяко изчистване или възстановяване.</T>
      <Btn variant="primary" title={busy ? 'Създаване…' : 'Създай резервно копие сега'} disabled={busy} style={{ alignSelf: 'flex-start' }} onPress={async () => {
        setBusy(true); const ok = await s.createBackup(); setBusy(false);
        toast(ok ? 'Резервното копие е създадено' : 'Неуспешно. Проверете връзката.'); load();
      }} />
      {list === null ? <T muted small>Зареждане на копията… (нужен е интернет)</T> : !list.length ? <T muted small>Още няма копия.</T> : (
        <View>
          {shown.map((b, i) => (
            <View key={b.id} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: t.ink, fontWeight: '700' }, NUM]}>{when(b.created_at)}</Text>
                  <Text style={{ color: t.ink2, fontSize: 12.5 }}>{KIND[b.kind]} · {b.summary?.transactions ?? 0} записа · {b.summary?.categories ?? 0} категории · {b.summary?.buckets ?? 0} фонда</Text>
                </View>
                <Btn variant={armed === b.id ? 'dangerSolid' : 'default'} title={armed === b.id ? 'Потвърди' : 'Възстанови'} disabled={busy} onPress={async () => {
                  if (armed !== b.id) return setArmed(b.id);
                  setBusy(true); const ok = await s.restoreBackup(b.id); setBusy(false); setArmed(null);
                  toast(ok ? `Данните са възстановени към ${when(b.created_at)}` : 'Възстановяването не успя.'); load();
                }} />
              </View>
              {armed === b.id ? <T small style={{ color: t.bad }}>Всички текущи данни ще бъдат заменени с това копие и на двата телефона. Преди това автоматично се прави копие на сегашното състояние, така че можете да се върнете.</T> : null}
            </View>
          ))}
          {list.length > 6 ? <Btn variant="link" title={more ? 'Покажи по-малко' : `Покажи всички (${list.length})`} onPress={() => setMore(!more)} style={{ alignSelf: 'flex-start' }} /> : null}
        </View>
      )}
    </Card>
  );
}

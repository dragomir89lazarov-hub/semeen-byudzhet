import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { cycleAroundToday } from '../data/derive';
import { useStore } from '../data/store';
import { dLabel } from '../lib/format';
import { useTheme } from '../lib/theme';
import { Btn, Card, Field, H2, Input, T } from '../ui/kit';

/** First run: create the household (first partner) or join it with a code (second partner). */
export default function HouseholdScreen() {
  const t = useTheme(); const s = useStore();
  const [me, setMe] = useState(''); const [partner, setPartner] = useState('');
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const cyc = cycleAroundToday({ type: 'monthly_day', day: 25, weekend: 'previous_business_day' });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 20, paddingTop: 70, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.ink, fontSize: 26, fontWeight: '800' }}>Добре дошли</Text>
      {s.lastError ? <T style={{ color: t.bad }}>{s.lastError}</T> : null}
      <Card>
        <H2>Създайте семейния бюджет</H2>
        <T muted small>За първия от вас. Създават се основните категории, общ бюджет за заплатите, три спестовни сметки и текущият период ({dLabel(cyc.start)} – {dLabel(cyc.end)}, заплата на 25-о число). Всичко може да се промени после.</T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Вашето име"><Input value={me} onChangeText={setMe} placeholder="Драгомир" /></Field>
          <Field label="Име на партньора"><Input value={partner} onChangeText={setPartner} placeholder="Съпруга" /></Field>
        </View>
        <Btn variant="primary" block disabled={busy} title="Създай бюджет" onPress={async () => {
          setBusy(true); await s.createHousehold([me.trim() || 'Аз', partner.trim() || 'Партньор'], cyc); setBusy(false);
        }} />
      </Card>
      <Card>
        <H2>Присъединяване с код</H2>
        <T muted small>За втория от вас. Кодът е в „Настройки → Покана за партньора“ на другия телефон.</T>
        <Input value={code} onChangeText={v => setCode(v.toUpperCase())} autoCapitalize="characters" placeholder="Напр. 3FA9C21B" maxLength={8} />
        <Btn block disabled={busy || code.trim().length < 6} title="Присъедини се" onPress={async () => {
          setBusy(true); await s.joinHousehold(code); setBusy(false);
        }} />
      </Card>
      <Btn variant="link" title="Изход от профила" onPress={() => s.signOut()} />
    </ScrollView>
  );
}

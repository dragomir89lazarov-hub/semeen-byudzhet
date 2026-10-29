import React, { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { Btn, Card, Field, H2, Input, T } from '../ui/kit';

export default function AuthScreen() {
  const t = useTheme();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');

  async function submit() {
    setMsg('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMsg('Въведете валиден имейл.');
    if (password.length < 6) return setMsg('Паролата трябва да е поне 6 знака.');
    setBusy(true);
    const { error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setMsg(/invalid login/i.test(error.message) ? 'Грешен имейл или парола.'
        : /already registered/i.test(error.message) ? 'Този имейл вече има профил. Влезте с него.'
        : /network|fetch/i.test(error.message) ? 'Няма връзка с интернет.' : error.message);
    }
  }

  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 80, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <Text style={{ color: t.ink, fontSize: 30, fontWeight: '800' }}>Семеен бюджет</Text>
          <T muted>Общ бюджет за двама: дневен остатък, фондове и история, синхронизирани между телефоните ви.</T>
        </View>
        <Card>
          <H2>{mode === 'in' ? 'Вход' : 'Нов профил'}</H2>
          <Field label="Имейл"><Input value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" /></Field>
          <Field label="Парола"><Input value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'in' ? 'password' : 'new-password'} onSubmitEditing={submit} /></Field>
          {msg ? <T small style={{ color: t.bad }}>{msg}</T> : null}
          <Btn variant="primary" block disabled={busy} title={busy ? 'Моля, изчакайте…' : mode === 'in' ? 'Вход' : 'Създай профил'} onPress={submit} />
          <Btn variant="link" title={mode === 'in' ? 'Нямате профил? Създайте нов' : 'Вече имате профил? Вход'} onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

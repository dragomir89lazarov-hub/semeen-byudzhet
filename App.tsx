import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { currentCycle } from './src/data/derive';
import { StoreProvider, useStore } from './src/data/store';
import { dLabel } from './src/lib/format';
import { supabase } from './src/lib/supabase';
import { useTheme } from './src/lib/theme';
import AuthScreen from './src/screens/AuthScreen';
import BucketsScreen from './src/screens/BucketsScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import HouseholdScreen from './src/screens/HouseholdScreen';
import QuickAddSheet from './src/screens/QuickAddSheet';
import SetupScreen from './src/screens/SetupScreen';
import TodayScreen from './src/screens/TodayScreen';
import { T, ToastProvider } from './src/ui/kit';
import { Nav, NavCtx, SheetInit, Tab } from './src/ui/nav';

export default function App() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const t = useTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      {session === undefined ? <Loading /> : !session ? <AuthScreen /> : (
        <StoreProvider key={session.user.id} userId={session.user.id}><Main /></StoreProvider>
      )}
    </View>
  );
}

function ErrorScreen() {
  const t = useTheme(); const s = useStore();
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14 }}>
      <Text style={{ color: t.ink, fontSize: 22, fontWeight: '800' }}>Няма връзка с базата данни</Text>
      <T muted>Проверете интернет връзката и опитайте отново. Ако проблемът остане, изпратете снимка на този екран.</T>
      <Text selectable style={{ color: t.bad, fontSize: 13 }}>{s.lastError}</Text>
      <Pressable onPress={() => s.retry()} style={{ backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ color: t.accentInk, fontWeight: '700' }}>Опитай отново</Text>
      </Pressable>
      <Pressable onPress={() => s.signOut()} style={{ paddingVertical: 10, alignItems: 'center' }}>
        <Text style={{ color: t.accent, fontWeight: '700' }}>Изход от профила</Text>
      </Pressable>
    </View>
  );
}

function Loading() {
  const t = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}><ActivityIndicator color={t.accent} /><T muted>Зареждане на бюджета…</T></View>;
}

const TABS: [Tab, string, string][] = [
  ['today', 'Днес', 'M4 13h4l2-5 4 10 2-5h4'],
  ['buckets', 'Фондове', 'M5 8h14l-1.5 11a2 2 0 0 1-2 1.7h-7a2 2 0 0 1-2-1.7zM8 8V6a4 4 0 0 1 8 0v2'],
  ['history', 'История', 'M4 20V10M10 20V4M16 20v-7M22 20H2'],
  ['setup', 'Настройки', 'M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1'],
];

function Main() {
  const t = useTheme(); const insets = useSafeAreaInsets();
  const s = useStore();
  const [tab, setTab] = useState<Tab>('today');
  const [sub, setSub] = useState<string | null>(null);
  const [txFilter, setTxFilter] = useState('all');
  const [sheet, setSheet] = useState<SheetInit | null>(null);
  const [metric, setMetricState] = useState<'today' | 'period' | 'avg'>('today');
  useEffect(() => { AsyncStorage.getItem('metric').then(v => { if (v === 'today' || v === 'period' || v === 'avg') setMetricState(v); }).catch(() => { }); }, []);

  // Android back button: close the sheet, then leave sub-screens, then go to Today.
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet) { setSheet(null); return true; }
      if (sub) { setSub(null); setTxFilter('all'); return true; }
      if (tab !== 'today') { setTab('today'); return true; }
      return false;
    });
    return () => h.remove();
  }, [sheet, sub, tab]);

  const nav: Nav = useMemo(() => ({
    tab, setTab: (x: Tab) => { setTab(x); setSub(null); }, sub, setSub, txFilter, setTxFilter,
    openSheet: (init: SheetInit) => setSheet(init), metric,
    setMetric: (x: 'today' | 'period' | 'avg') => { setMetricState(x); AsyncStorage.setItem('metric', x).catch(() => { }); },
  }), [tab, sub, txFilter, metric]);

  if (s.status === 'loading') return <Loading />;
  if (s.status === 'error') return <ErrorScreen />;
  if (s.status === 'nohousehold') return <HouseholdScreen />;
  const c = currentCycle(s.model);

  return (
    <NavCtx.Provider value={nav}>
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 }}>
          <Text style={{ color: t.ink, fontSize: 22, fontWeight: '800' }}>Семеен бюджет</Text>
          <Text style={{ color: t.ink2, fontSize: 13 }}>{c ? `${dLabel(c.start)} – ${dLabel(c.end)}` : ''}{s.pending ? ' · ⟳' : ''}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {tab === 'today' ? <TodayScreen /> : tab === 'buckets' ? <BucketsScreen /> : tab === 'history' ? <HistoryScreen /> : <SetupScreen />}
        </View>

        {c ? (
          <Pressable onPress={() => setSheet({})} accessibilityLabel="Добави запис"
            style={({ pressed }) => ({ position: 'absolute', right: 18, bottom: 78 + insets.bottom, width: 60, height: 60, borderRadius: 18, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', elevation: 6, opacity: pressed ? 0.85 : 1 })}>
            <Svg width={26} height={26} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" stroke={t.accentInk} strokeWidth={2.4} strokeLinecap="round" /></Svg>
          </Pressable>
        ) : null}

        <View style={{ flexDirection: 'row', backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.line, paddingBottom: insets.bottom + 4, paddingTop: 6 }}>
          {TABS.map(([k, label, d]) => {
            const on = tab === k; const col = on ? t.accent : t.ink2;
            return (
              <Pressable key={k} onPress={() => nav.setTab(k)} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 }} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Svg width={22} height={22} viewBox="0 0 24 24">
                  <Path d={d} stroke={col} strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  {k === 'setup' ? <Circle cx={12} cy={12} r={3} stroke={col} strokeWidth={1.9} fill="none" /> : null}
                </Svg>
                <Text style={{ color: col, fontSize: 11.5, fontWeight: '700' }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <QuickAddSheet init={sheet} onClose={() => setSheet(null)} />
      </View>
    </NavCtx.Provider>
  );
}

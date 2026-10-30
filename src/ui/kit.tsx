import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleProp, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';
import { useTheme } from '../lib/theme';

export const NUM: TextStyle = { fontVariant: ['tabular-nums'] };

export function Screen({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 14 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, highlight }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; highlight?: boolean }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderRadius: 16, padding: 16, gap: 10 }, highlight && { borderWidth: 2, borderColor: t.accent }, style]}>{children}</View>;
}

export function T({ children, style, muted, small, bold, numberOfLines }: {
  children: React.ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; small?: boolean; bold?: boolean; numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: muted ? t.ink2 : t.ink, fontSize: small ? 13 : 15, lineHeight: small ? 18 : 21 }, bold && { fontWeight: '600' }, style]}>
      {children}
    </Text>
  );
}
export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[{ color: t.ink, fontSize: 18, fontWeight: '700' }, style]}>{children}</Text>;
}
export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[{ color: t.ink2, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }, style]}>{children}</Text>;
}
export const Row = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) =>
  <View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 6 }, style]}>{children}</View>;

export function Btn({ title, onPress, variant = 'default', disabled, block, style }: {
  title: string; onPress?: () => void; variant?: 'primary' | 'default' | 'danger' | 'dangerSolid' | 'link' | 'accentOutline';
  disabled?: boolean; block?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.accent : variant === 'dangerSolid' ? t.bad : variant === 'link' ? 'transparent' : t.surface;
  const border = variant === 'primary' ? t.accent : variant === 'danger' || variant === 'dangerSolid' ? t.bad : variant === 'link' ? 'transparent' : variant === 'accentOutline' ? t.accent : t.line;
  const fg = variant === 'primary' ? t.accentInk : variant === 'dangerSolid' ? '#fff' : variant === 'danger' ? t.bad : variant === 'link' || variant === 'accentOutline' ? t.accent : t.ink;
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [{
        backgroundColor: bg, borderColor: border, borderWidth: variant === 'link' ? 0 : 1, borderRadius: 12,
        paddingVertical: block ? 14 : variant === 'link' ? 6 : 10, paddingHorizontal: variant === 'link' ? 0 : 14,
        alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      }, block && { alignSelf: 'stretch' }, style]}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 14.5 }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityState={{ selected }}
      style={{ borderWidth: 1, borderColor: selected ? t.ink : t.line, backgroundColor: selected ? t.ink : t.surface, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13 }}>
      <Text style={{ color: selected ? t.bg : t.ink, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
export function Chips({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

export function Pill({ status, text }: { status: 'on_track' | 'tight' | 'overspending' | 'overdrawn'; text: string }) {
  const t = useTheme();
  const [bg, fg] = status === 'on_track' ? [t.goodSoft, t.good] : status === 'tight' ? [t.warnSoft, t.warn] : [t.badSoft, t.bad];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: fg }} />
      <Text style={{ color: fg, fontSize: 12.5, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ gap: 6, flex: 1 }}><Text style={{ color: t.ink2, fontSize: 13, fontWeight: '500' }}>{label}</Text>{children}</View>;
}
export function Input(props: TextInputProps) {
  const t = useTheme();
  return <TextInput placeholderTextColor={t.ink2} {...props}
    style={[{ borderWidth: 1, borderColor: t.line, backgroundColor: t.bg, color: t.ink, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15 }, props.style]} />;
}

export function Check({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable disabled={disabled} onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: value }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: value ? t.accent : t.line, backgroundColor: value ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {value ? <Text style={{ color: t.accentInk, fontSize: 13, fontWeight: '900', lineHeight: 15 }}>✓</Text> : null}
      </View>
      <Text style={{ color: t.ink, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────
const ToastCtx = createContext<(msg: string) => void>(() => { });
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 160, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ backgroundColor: t.ink, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 }}>
            <Text style={{ color: t.bg, fontWeight: '700' }}>{msg}</Text>
          </View>
        </View>
      ) : null}
    </ToastCtx.Provider>
  );
}

/** Pick one of the palette colours (stored as an index). */
export function ColorPicker({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {t.cats.map((c, i) => (
        <Pressable key={i} onPress={() => onChange(i)} accessibilityLabel={`Цвят ${i + 1}`} accessibilityState={{ selected: value === i }}
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, alignItems: 'center', justifyContent: 'center',
            borderWidth: value === i ? 3 : 0, borderColor: t.ink }}>
          {value === i ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

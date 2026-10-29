import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { dateOf, dwLabel, isoOf } from '../lib/format';
import { useTheme } from '../lib/theme';

/** Shows a date like "чт, 29 окт." and opens the Android calendar when tapped. */
export default function DateButton({ value, onChange, disabled }: { value: string; onChange: (iso: string) => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable disabled={disabled} accessibilityRole="button"
      onPress={() => DateTimePickerAndroid.open({
        value: dateOf(value), mode: 'date',
        onChange: (event, date) => { if (event.type === 'set' && date) onChange(isoOf(date)); },
      })}
      style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.bg, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: t.ink, fontSize: 15 }}>{dwLabel(value)}</Text>
    </Pressable>
  );
}

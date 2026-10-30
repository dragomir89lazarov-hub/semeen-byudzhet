import { useColorScheme } from 'react-native';

export interface Theme {
  dark: boolean;
  bg: string; surface: string; sunk: string; ink: string; ink2: string; line: string;
  accent: string; accentInk: string; accentSoft: string;
  good: string; goodSoft: string; warn: string; warnSoft: string; bad: string; badSoft: string;
  cats: string[];
}

export const light: Theme = {
  dark: false,
  bg: '#F1F3F7', surface: '#FFFFFF', sunk: '#E7EAF0', ink: '#151B26', ink2: '#5A6475', line: '#DADFE7',
  accent: '#5B3A9E', accentInk: '#FFFFFF', accentSoft: '#ECE5F8',
  good: '#1D7A4C', goodSoft: '#E1F2E8', warn: '#9A5B00', warnSoft: '#FAEFD9', bad: '#B42318', badSoft: '#FBE5E2',
  cats: ['#2F6FD0', '#D9822B', '#C2417A', '#6C7A89', '#2E9C8A', '#8E6AD8', '#A8921A', '#E25C4B', '#3F8F3A', '#8A5A2B', '#4F5FC0', '#D9648F'],
};

export const dark: Theme = {
  dark: true,
  bg: '#0E1218', surface: '#161B24', sunk: '#1F2632', ink: '#E8ECF2', ink2: '#9AA4B4', line: '#2A3240',
  accent: '#AE93EE', accentInk: '#160F24', accentSoft: '#2A2240',
  good: '#52C68E', goodSoft: '#15291F', warn: '#E8AA45', warnSoft: '#2D2210', bad: '#F27B70', badSoft: '#331816',
  cats: ['#6A9DEB', '#EEA25A', '#E072A3', '#98A5B3', '#4FC2AE', '#AE93EE', '#CDB743', '#F28474', '#6CC067', '#C9925E', '#8C9AF0', '#F29AB8'],
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const catColor = (t: Theme, i: number | null | undefined) => { const n = t.cats.length; return t.cats[(((i ?? 0) % n) + n) % n]; };

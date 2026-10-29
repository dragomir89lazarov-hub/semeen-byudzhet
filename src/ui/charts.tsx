import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { dLabel, eur0 } from '../lib/format';
import type { Theme } from '../lib/theme';

/** Cumulative flexible spending vs. the even-pace line. */
export function VelocityChart({ t, series, budget, total, start, end }: {
  t: Theme; series: { actualCents: number; safeCents: number }[]; budget: number; total: number; start: string; end: string;
}) {
  const W = 340, H = 170, L = 8, R = 8, T = 18, B = 26;
  const maxY = Math.max(budget, ...series.map(s => s.actualCents), 1) * 1.08;
  const X = (i: number) => L + (i / Math.max(1, total - 1)) * (W - L - R);
  const Y = (v: number) => T + (1 - v / maxY) * (H - T - B);
  const pts = series.map((s, i) => `${X(i).toFixed(1)},${Y(s.actualCents).toFixed(1)}`).join(' ');
  const last = series[series.length - 1];
  const ahead = !!last && last.actualCents > last.safeCents;
  const col = ahead ? t.bad : t.accent;
  return (
    <View style={{ aspectRatio: W / H, width: '100%' }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        {[0.25, 0.5, 0.75].map(f => <Line key={f} x1={L} x2={W - R} y1={Y((maxY * f) / 1.08)} y2={Y((maxY * f) / 1.08)} stroke={t.line} strokeDasharray="2 4" />)}
        <Line x1={X(0)} y1={Y(0)} x2={X(total - 1)} y2={Y(budget)} stroke={t.ink2} strokeWidth={1.5} strokeDasharray="5 4" />
        <SvgText x={W - R} y={Y(budget) - 6} textAnchor="end" fontSize={11} fill={t.ink2}>{`${eur0(budget)} равномерно`}</SvgText>
        {series.length ? (
          <>
            <Polygon points={`${X(0)},${Y(0)} ${pts} ${X(series.length - 1)},${Y(0)}`} fill={t.accent} fillOpacity={0.12} />
            <Polyline points={pts} fill="none" stroke={col} strokeWidth={2.4} strokeLinejoin="round" />
            <Circle cx={X(series.length - 1)} cy={Y(last.actualCents)} r={4.5} fill={col} stroke={t.surface} strokeWidth={2} />
          </>
        ) : null}
        <Line x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} stroke={t.line} />
        <SvgText x={L} y={H - 8} fontSize={11} fill={t.ink2}>{dLabel(start)}</SvgText>
        {series.length > 1 && series.length < total - 3
          ? <SvgText x={X(series.length - 1)} y={H - 8} textAnchor="middle" fontSize={11} fontWeight="600" fill={t.ink}>Днес</SvgText> : null}
        <SvgText x={W - R} y={H - 8} textAnchor="end" fontSize={11} fill={t.ink2}>{dLabel(end)}</SvgText>
      </Svg>
    </View>
  );
}

/** Spending by category. */
export function Donut({ t, parts, total }: { t: Theme; parts: { color: string; value: number }[]; total: number }) {
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <Svg width={132} height={132} viewBox="0 0 132 132">
      <Circle r={R} cx={66} cy={66} fill="none" stroke={t.sunk} strokeWidth={18} />
      {total > 0 ? parts.filter(p => p.value > 0).map((p, i) => {
        const len = (p.value / total) * C;
        const el = <Circle key={i} r={R} cx={66} cy={66} fill="none" stroke={p.color} strokeWidth={18}
          strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 66 66)" />;
        off += len; return el;
      }) : null}
      <SvgText x={66} y={60} textAnchor="middle" fontSize={11} fill={t.ink2}>Похарчено</SvgText>
      <SvgText x={66} y={80} textAnchor="middle" fontSize={16} fontWeight="700" fill={t.ink}>{eur0(total)}</SvgText>
    </Svg>
  );
}

/** Progress ring for a fund target. */
export function Ring({ t, pct, color }: { t: Theme; pct: number | null; color: string }) {
  const R = 23, C = 2 * Math.PI * R;
  return (
    <Svg width={58} height={58} viewBox="0 0 58 58">
      <Circle cx={29} cy={29} r={R} fill="none" stroke={t.sunk} strokeWidth={7} />
      {pct !== null ? (
        <>
          <Circle cx={29} cy={29} r={R} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${pct * C} ${C}`} transform="rotate(-90 29 29)" />
          <SvgText x={29} y={33} textAnchor="middle" fontSize={12} fontWeight="600" fill={t.ink}>{`${Math.round(pct * 100)}%`}</SvgText>
        </>
      ) : <Circle cx={29} cy={29} r={9} fill={color} />}
    </Svg>
  );
}

/** Icon for the salaries fund. */
export function WalletIcon({ color }: { color: string }) {
  return (
    <Svg width={58} height={58} viewBox="0 0 58 58">
      <Rect x={7} y={13} width={44} height={32} rx={7} fill="none" stroke={color} strokeWidth={5} />
      <Circle cx={29} cy={29} r={6} fill={color} />
    </Svg>
  );
}

/** Small bars per cycle for one category; the last (in-progress) bar is faded. */
export function MiniBars({ values, color, doneFlags }: { values: number[]; color: string; doneFlags: boolean[] }) {
  const max = Math.max(...values, 1); const bw = 120 / Math.max(1, values.length);
  return (
    <Svg width={120} height={32} viewBox="0 0 120 32">
      {values.map((v, i) => <Rect key={i} x={i * bw + 2} y={30 - (v / max) * 28} width={Math.max(1, bw - 4)} height={Math.max(1, (v / max) * 28)} rx={2} fill={color} fillOpacity={doneFlags[i] ? 1 : 0.4} />)}
    </Svg>
  );
}

/** Horizontal progress bar. */
export function Track({ t, pct, color }: { t: Theme; pct: number; color: string }) {
  return (
    <View style={{ height: 8, borderRadius: 99, backgroundColor: t.sunk, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: 99, backgroundColor: color }} />
    </View>
  );
}

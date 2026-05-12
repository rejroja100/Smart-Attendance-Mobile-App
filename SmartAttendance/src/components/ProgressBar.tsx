import React from 'react';
import { View } from 'react-native';
import type { AttendanceStatus } from '@/utils/helpers';
import { pctColor } from '@/utils/helpers';

interface ProgressBarProps {
  value: number; // 0..100
  tone?: AttendanceStatus;
  height?: number;
}

const TONE_BG: Record<AttendanceStatus, string> = {
  good: 'bg-emerald-500',
  warning: 'bg-amber-400',
  danger: 'bg-red-500',
};

export function ProgressBar({ value, tone, height = 8 }: ProgressBarProps): JSX.Element {
  const clamped = Math.max(0, Math.min(100, value));
  const resolvedTone = tone ?? pctColor(clamped);
  return (
    <View
      className="w-full overflow-hidden rounded-full bg-slate-700"
      style={{ height }}
    >
      <View
        className={`h-full ${TONE_BG[resolvedTone]}`}
        style={{ width: `${clamped}%` }}
      />
    </View>
  );
}

export default ProgressBar;

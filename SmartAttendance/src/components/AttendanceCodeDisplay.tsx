import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ProgressBar } from './ProgressBar';

interface AttendanceCodeDisplayProps {
  code: string;
  secondsLeft: number;
  totalSeconds: number;
  onStop?: () => void;
  expired?: boolean;
}

export function AttendanceCodeDisplay({
  code,
  secondsLeft,
  totalSeconds,
  onStop,
  expired = false,
}: AttendanceCodeDisplayProps): JSX.Element {
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100)) : 0;

  return (
    <View className="rounded-2xl bg-slate-900 p-5">
      <View className="flex-row items-center mb-3">
        <View
          className={`px-2.5 py-1 rounded-full ${
            expired ? 'bg-red-600/20' : 'bg-emerald-600/20'
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              expired ? 'text-red-300' : 'text-emerald-300'
            }`}
          >
            {expired ? '● Code Expired' : '● Code Active'}
          </Text>
        </View>
      </View>

      <View className="rounded-xl bg-slate-950 py-6 items-center">
        <Text
          className="text-white text-5xl font-mono tracking-widest"
          style={{ letterSpacing: 8 }}
        >
          {code}
        </Text>
      </View>

      <View className="mt-5">
        <View className="flex-row justify-between mb-1">
          <Text className="text-slate-400 text-xs">
            {expired ? 'Session ended' : `Expires in ${secondsLeft}s`}
          </Text>
          <Text className="text-slate-400 text-xs">{totalSeconds}s total</Text>
        </View>
        <ProgressBar value={pct} tone={expired ? 'danger' : pct < 25 ? 'danger' : pct < 60 ? 'warning' : 'good'} />
      </View>

      {onStop && !expired ? (
        <Pressable
          onPress={onStop}
          className="mt-5 rounded-xl bg-red-600 active:opacity-80 py-3 items-center"
        >
          <Text className="text-white font-semibold">Stop Session</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default AttendanceCodeDisplay;

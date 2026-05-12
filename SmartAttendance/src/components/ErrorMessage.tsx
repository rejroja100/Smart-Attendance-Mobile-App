import React from 'react';
import { Pressable, Text, View } from 'react-native';

interface ErrorMessageProps {
  message?: string | null;
  onRetry?: () => void;
  tone?: 'danger' | 'warning' | 'info';
}

const TONE: Record<NonNullable<ErrorMessageProps['tone']>, { bg: string; text: string }> = {
  danger: { bg: 'bg-red-600/15 border-red-600/40', text: 'text-red-300' },
  warning: { bg: 'bg-amber-500/15 border-amber-500/40', text: 'text-amber-300' },
  info: { bg: 'bg-sky-500/15 border-sky-500/40', text: 'text-sky-300' },
};

export function ErrorMessage({
  message,
  onRetry,
  tone = 'danger',
}: ErrorMessageProps): JSX.Element | null {
  if (!message) return null;
  const palette = TONE[tone];
  return (
    <View className={`rounded-xl border px-4 py-3 my-2 ${palette.bg}`}>
      <Text className={`text-sm ${palette.text}`}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          className="self-start mt-2 px-3 py-1.5 rounded-lg bg-white/10 active:opacity-80"
        >
          <Text className="text-white text-xs font-semibold">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default ErrorMessage;

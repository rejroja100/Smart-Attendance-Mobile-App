import React from 'react';
import { Pressable, Text, View } from 'react-native';

interface AttendanceMethodCardProps {
  title: string;
  description: string;
  icon: string;
  tone?: 'blue' | 'teal' | 'slate';
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}

const TONE_CLASSES: Record<NonNullable<AttendanceMethodCardProps['tone']>, string> = {
  blue: 'bg-indigo-600',
  teal: 'bg-teal-600',
  slate: 'bg-slate-700',
};

export function AttendanceMethodCard({
  title,
  description,
  icon,
  tone = 'slate',
  selected = false,
  disabled = false,
  onPress,
  children,
}: AttendanceMethodCardProps): JSX.Element {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      className={`rounded-2xl p-4 mb-3 ${
        selected ? 'bg-slate-800 border border-sky-400' : 'bg-slate-800 border border-transparent'
      } ${disabled ? 'opacity-50' : 'active:opacity-90'}`}
    >
      <View className="flex-row items-center">
        <View
          className={`w-12 h-12 rounded-xl ${TONE_CLASSES[tone]} items-center justify-center`}
        >
          <Text className="text-white text-2xl">{icon}</Text>
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-white font-semibold text-base">{title}</Text>
          <Text className="text-slate-400 text-xs mt-0.5">{description}</Text>
        </View>
      </View>
      {selected && children ? <View className="mt-4">{children}</View> : null}
    </Pressable>
  );
}

export default AttendanceMethodCard;

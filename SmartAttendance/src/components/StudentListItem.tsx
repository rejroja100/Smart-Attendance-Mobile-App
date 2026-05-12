import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Student } from '@/types';
import { getInitial, randomColor } from '@/utils/helpers';

interface StudentListItemProps {
  student: Student;
  mode?: 'view' | 'mark';
  present?: boolean;
  onMarkPresent?: () => void;
  onMarkAbsent?: () => void;
  onRemove?: () => void;
  showEmail?: boolean;
}

export function StudentListItem({
  student,
  mode = 'view',
  present = false,
  onMarkPresent,
  onMarkAbsent,
  onRemove,
  showEmail = true,
}: StudentListItemProps): JSX.Element {
  const avatarColor = randomColor(student.id || student.email);
  return (
    <View className="flex-row items-center py-3 px-3 bg-slate-800 rounded-xl mb-2">
      <View
        className={`w-10 h-10 rounded-full items-center justify-center ${avatarColor}`}
      >
        <Text className="text-white font-bold">{getInitial(student.name)}</Text>
      </View>
      <View className="flex-1 ml-3">
        <Text className="text-white font-semibold" numberOfLines={1}>
          {student.name}
        </Text>
        <Text className="text-slate-400 text-xs" numberOfLines={1}>
          {student.roll}
          {showEmail && student.email ? `  •  ${student.email}` : ''}
        </Text>
      </View>

      {mode === 'mark' ? (
        <View className="flex-row">
          <Pressable
            onPress={onMarkPresent}
            className={`px-3 py-1.5 rounded-lg mr-2 ${
              present ? 'bg-emerald-600' : 'bg-slate-700'
            } active:opacity-80`}
          >
            <Text className="text-white text-xs font-semibold">Present</Text>
          </Pressable>
          <Pressable
            onPress={onMarkAbsent}
            className={`px-3 py-1.5 rounded-lg ${
              !present ? 'bg-red-600' : 'bg-slate-700'
            } active:opacity-80`}
          >
            <Text className="text-white text-xs font-semibold">Absent</Text>
          </Pressable>
        </View>
      ) : onRemove ? (
        <Pressable
          onPress={onRemove}
          className="px-3 py-1.5 rounded-lg bg-red-600/20 active:opacity-80"
        >
          <Text className="text-red-300 text-xs font-semibold">Remove</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default StudentListItem;

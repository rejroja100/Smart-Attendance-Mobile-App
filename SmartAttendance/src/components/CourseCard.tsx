import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Course } from '@/types';
import { randomColor } from '@/utils/helpers';

interface CourseCardProps {
  course: Course;
  onPress?: () => void;
  onLongPress?: () => void;
  showInstructor?: boolean;
}

export function CourseCard({
  course,
  onPress,
  onLongPress,
  showInstructor = false,
}: CourseCardProps): JSX.Element {
  const accent = randomColor(course.id || course.code);
  const studentCount = course.studentIds?.length ?? 0;
  const classCount = course.totalClasses ?? 0;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
      className="flex-1 m-1.5 rounded-2xl overflow-hidden bg-slate-800 active:opacity-80"
    >
      <View className={`h-2 w-full ${accent}`} />
      <View className="p-4">
        <Text
          className="text-white text-base font-semibold"
          numberOfLines={2}
        >
          {course.name}
        </Text>
        <Text className="text-slate-400 text-xs mt-1" numberOfLines={1}>
          {course.code}
        </Text>
        {showInstructor && course.teacherName ? (
          <Text className="text-slate-400 text-xs mt-2" numberOfLines={1}>
            👤 {course.teacherName}
          </Text>
        ) : null}
        <View className="flex-row items-center mt-4 flex-wrap">
          <View className="px-2 py-1 rounded-full bg-slate-700 mr-1.5 mb-1">
            <Text className="text-slate-200 text-xs">
              👥 {studentCount} {studentCount === 1 ? 'student' : 'students'}
            </Text>
          </View>
          <View className="px-2 py-1 rounded-full bg-slate-700 mb-1">
            <Text className="text-slate-200 text-xs">
              📚 {classCount} {classCount === 1 ? 'class' : 'classes'}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default CourseCard;

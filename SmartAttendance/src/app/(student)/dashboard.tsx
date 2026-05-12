import React, { useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStudentDashboard } from '@/hooks/useAttendance';
import { ProgressBar } from '@/components/ProgressBar';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorMessage } from '@/components/ErrorMessage';

const STATUS_COLOR: Record<'good' | 'warning' | 'danger', string> = {
  good: 'text-emerald-400',
  warning: 'text-amber-300',
  danger: 'text-red-400',
};

export default function StudentDashboard(): JSX.Element {
  const router = useRouter();
  const { courses, loading, refreshing, error, refresh } = useStudentDashboard();

  const totals = useMemo(() => {
    const total = courses.length;
    const onTrack = courses.filter((c) => c.percentage >= 75).length;
    const atRisk = total - onTrack;
    const avg =
      total === 0
        ? 0
        : Math.round(
            (courses.reduce((s, c) => s + c.percentage, 0) / total) * 10,
          ) / 10;
    return { total, onTrack, atRisk, avg };
  }, [courses]);

  if (loading) return <LoadingScreen message="Loading dashboard…" />;

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <View className="px-5 pt-2 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-slate-800 items-center justify-center active:opacity-80"
        >
          <Text className="text-white text-lg">←</Text>
        </Pressable>
        <Text className="text-white text-lg font-semibold ml-3">
          Attendance Overview
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor="#38bdf8"
          />
        }
      >
        <ErrorMessage message={error} onRetry={refresh} />

        <View className="flex-row flex-wrap -mx-1">
          <SummaryCard label="Courses" value={String(totals.total)} />
          <SummaryCard label="Average" value={`${totals.avg}%`} />
          <SummaryCard label="On Track" value={String(totals.onTrack)} tone="good" />
          <SummaryCard label="At Risk" value={String(totals.atRisk)} tone="danger" />
        </View>

        <Text className="text-slate-300 text-base font-semibold mt-6 mb-2">
          Per-course attendance
        </Text>

        {courses.length === 0 ? (
          <View className="items-center mt-12">
            <Text className="text-slate-500 text-4xl">📭</Text>
            <Text className="text-slate-400 mt-3">
              You're not enrolled in any courses yet.
            </Text>
          </View>
        ) : (
          courses.map((c) => (
            <View
              key={c.id}
              className="bg-slate-800 rounded-2xl p-4 mb-3"
            >
              <View className="flex-row items-center">
                <View className="flex-1">
                  <Text
                    className="text-white font-semibold text-base"
                    numberOfLines={1}
                  >
                    {c.name}
                  </Text>
                  <Text className="text-slate-400 text-xs mt-0.5">{c.code}</Text>
                </View>
                <View className="items-end">
                  <Text
                    className={`text-2xl font-bold ${STATUS_COLOR[c.status]}`}
                  >
                    {Math.round(c.percentage)}%
                  </Text>
                  {c.status === 'danger' ? (
                    <Text className="text-red-400 text-xs mt-0.5">⚠ At risk</Text>
                  ) : null}
                </View>
              </View>
              <View className="mt-3">
                <ProgressBar value={c.percentage} tone={c.status} />
              </View>
              <Text className="text-slate-400 text-xs mt-2">
                Present {c.presentCount} of {c.totalClasses} classes
              </Text>
            </View>
          ))
        )}

        <View className="h-10" />
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'danger';
}): JSX.Element {
  const valueColor =
    tone === 'good'
      ? 'text-emerald-400'
      : tone === 'danger'
      ? 'text-red-400'
      : 'text-white';
  return (
    <View className="w-1/2 px-1 mb-2">
      <View className="bg-slate-800 rounded-2xl p-4">
        <Text className="text-slate-400 text-xs">{label}</Text>
        <Text className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</Text>
      </View>
    </View>
  );
}

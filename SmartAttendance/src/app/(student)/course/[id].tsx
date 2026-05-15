import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCourse } from '@/hooks/useCourses';
import { useVerifyCode } from '@/hooks/useAttendance';
import { useStudentScan } from '@/hooks/useBluetooth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorMessage } from '@/components/ErrorMessage';
import { AttendanceMethodCard } from '@/components/AttendanceMethodCard';
import { BluetoothScanner } from '@/components/BluetoothScanner';
import { formatDate, formatTime } from '@/utils/helpers';
import type { AttendanceMethod, AttendanceRecord } from '@/types';

type SelectedMethod = 'bluetooth' | 'code' | null;

interface SuccessInfo {
  courseName: string;
  method: AttendanceMethod;
  record: AttendanceRecord;
}

export default function StudentCourseDetail(): JSX.Element {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = id ?? '';
  const { course, loading, error, refresh } = useCourse(courseId);

  const [method, setMethod] = useState<SelectedMethod>(null);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);

  // Code verification
  const verify = useVerifyCode();
  const [code, setCode] = useState('');

  // Bluetooth scan
  const scan = useStudentScan();

  const handleSubmitCode = async () => {
    if (!course) return;
    const record = await verify.verify(courseId, code);
    if (record) {
      setSuccess({ courseName: course.name, method: record.method, record });
    }
  };

  const handleScan = () => {
    if (!course) return;
    Alert.alert(
      'Turn on Bluetooth',
      "Make sure your phone's Bluetooth is ON before scanning. Without it, your phone cannot detect the teacher.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            const ok = await scan.scan(courseId);
            if (ok) {
              setSuccess({
                courseName: course.name,
                method: 'bluetooth',
                record: {
                  date: formatDate(new Date()),
                  present: true,
                  method: 'bluetooth',
                  timestamp: new Date().toISOString(),
                },
              });
            }
          },
        },
      ],
    );
  };

  if (loading) return <LoadingScreen message="Loading course…" />;
  if (!course) {
    return (
      <SafeAreaView className="flex-1 bg-slate-950 px-5 pt-4">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-slate-800 items-center justify-center active:opacity-80"
        >
          <Text className="text-white text-lg">←</Text>
        </Pressable>
        <ErrorMessage message={error ?? 'Course not found.'} onRetry={refresh} />
      </SafeAreaView>
    );
  }

  if (success) {
    return (
      <SuccessOverlay
        info={success}
        onDone={() => router.replace('/(student)')}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <View className="px-5 pt-2 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-slate-800 items-center justify-center active:opacity-80"
        >
          <Text className="text-white text-lg">←</Text>
        </Pressable>
        <View className="flex-1 ml-3">
          <Text className="text-white text-lg font-bold" numberOfLines={1}>
            {course.name}
          </Text>
          <Text className="text-slate-400 text-xs">
            {course.code}  •  {course.teacherName}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-5 pt-5">
        <Text className="text-white text-xl font-bold mb-4">
          Mark Your Attendance
        </Text>

        {/* Bluetooth */}
        <AttendanceMethodCard
          title="Bluetooth Detection"
          description="Auto-detect when you are in classroom"
          icon="📡"
          tone="blue"
          selected={method === 'bluetooth'}
          onPress={() =>
            setMethod((m) => (m === 'bluetooth' ? null : 'bluetooth'))
          }
        >
          <View className="items-center py-2">
            <BluetoothScanner active={scan.status === 'scanning' || scan.status === 'submitting'} label="Looking for teacher…" />
          </View>
          <ErrorMessage message={scan.error} />
          {scan.status === 'not_found' ? (
            <ErrorMessage message="Teacher not found. Make sure you're in the classroom." tone="warning" />
          ) : null}
          <Pressable
            onPress={handleScan}
            disabled={scan.status === 'scanning' || scan.status === 'submitting'}
            className={`rounded-xl py-3 items-center ${
              scan.status === 'scanning' || scan.status === 'submitting'
                ? 'bg-slate-700 opacity-60'
                : 'bg-sky-600 active:opacity-80'
            }`}
          >
            {scan.status === 'scanning' || scan.status === 'submitting' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">Scan for Teacher</Text>
            )}
          </Pressable>
        </AttendanceMethodCard>

        {/* Code */}
        <AttendanceMethodCard
          title="Instructor Code"
          description="Enter the 6-character code from your teacher"
          icon="#"
          tone="teal"
          selected={method === 'code'}
          onPress={() => setMethod((m) => (m === 'code' ? null : 'code'))}
        >
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase().slice(0, 6))}
            placeholder="ABC123"
            placeholderTextColor="#475569"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            className="bg-slate-950 text-white rounded-xl px-4 py-5 text-center text-3xl font-mono"
            style={{ letterSpacing: 6 }}
          />
          <ErrorMessage message={verify.error} />
          <Pressable
            onPress={handleSubmitCode}
            disabled={code.length !== 6 || verify.verifying}
            className={`mt-3 rounded-xl py-3 items-center ${
              code.length === 6 && !verify.verifying
                ? 'bg-emerald-600 active:opacity-80'
                : 'bg-slate-700 opacity-60'
            }`}
          >
            {verify.verifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">Submit Code</Text>
            )}
          </Pressable>
        </AttendanceMethodCard>

        {/* Manual (display only) */}
        <AttendanceMethodCard
          title="Manual"
          description="Marked by your teacher — no action needed"
          icon="✍️"
          tone="slate"
          disabled
        />

        <View className="h-12" />
      </ScrollView>
    </SafeAreaView>
  );
}

function SuccessOverlay({
  info,
  onDone,
}: {
  info: SuccessInfo;
  onDone: () => void;
}): JSX.Element {
  const scale = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
      tension: 80,
    }).start();
  }, [scale]);

  return (
    <SafeAreaView className="flex-1 bg-emerald-600">
      <View className="flex-1 items-center justify-center px-8">
        <Animated.View
          style={{ transform: [{ scale }] }}
          className="w-32 h-32 rounded-full bg-white items-center justify-center"
        >
          <Text style={{ fontSize: 72, color: '#059669' }}>✓</Text>
        </Animated.View>
        <Text className="text-white text-3xl font-bold mt-6">
          Attendance Marked!
        </Text>
        <Text className="text-white/90 text-base mt-2 text-center">
          {info.courseName}
        </Text>
        <View className="bg-white/15 rounded-2xl px-5 py-4 mt-6 w-full">
          <Row label="Date" value={info.record.date} />
          <Row label="Time" value={formatTime(info.record.timestamp)} />
          <Row label="Method" value={info.method} />
        </View>
        <Pressable
          onPress={onDone}
          className="mt-8 px-6 py-3 rounded-xl bg-white active:opacity-80"
        >
          <Text className="text-emerald-700 font-semibold">Back to Courses</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-white/80 text-sm capitalize">{label}</Text>
      <Text className="text-white text-sm font-semibold capitalize">{value}</Text>
    </View>
  );
}

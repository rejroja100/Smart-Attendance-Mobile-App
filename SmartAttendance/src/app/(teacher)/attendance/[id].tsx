import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCourse } from '@/hooks/useCourses';
import {
  useCodeSession,
  useCourseAttendance,
  useSessionRoster,
} from '@/hooks/useAttendance';
import { useTeacherBroadcast } from '@/hooks/useBluetooth';
import { submitManualAttendance } from '@/services/api';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorMessage } from '@/components/ErrorMessage';
import { AttendanceCodeDisplay } from '@/components/AttendanceCodeDisplay';
import { BluetoothScanner } from '@/components/BluetoothScanner';
import { StudentListItem } from '@/components/StudentListItem';
import { CODE_DURATION_SECONDS } from '@/utils/constants';
import { generateAttendanceCode } from '@/utils/helpers';
import type { Student } from '@/types';

type Tab = 'bluetooth' | 'code' | 'manual';
type Filter = 'all' | 'present' | 'absent';

export default function TeacherAttendance(): JSX.Element {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = id ?? '';
  const { course, loading, error, refresh } = useCourse(courseId);

  const [tab, setTab] = useState<Tab>('code');

  // Code session — auto-generate a starter code on mount and on each "new
  // code" reset, so the teacher only has to tap Launch (but can override).
  const codeSession = useCodeSession(courseId);
  const [typedCode, setTypedCode] = useState<string>(() => generateAttendanceCode());

  // Manual marking state — local to this screen
  const [manualMarks, setManualMarks] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Filter>('all');

  // Bluetooth broadcast
  const broadcast = useTeacherBroadcast();

  // Review flags — true after teacher stops/expires the BT or Code session
  const [btReviewing, setBtReviewing] = useState(false);
  const [codeReviewing, setCodeReviewing] = useState(false);

  // Polling live attendance during any active BT/Code session
  const sessionRunning =
    broadcast.broadcasting ||
    (codeSession.activeCode !== null && !codeSession.expired);
  const live = useCourseAttendance(courseId, sessionRunning ? 4000 : null);

  // Shared rosters — one per method, each watches its own method's records
  const btRoster = useSessionRoster(course, live.records ?? {}, 'bluetooth');
  const codeRoster = useSessionRoster(course, live.records ?? {}, 'code');

  // Auto-transition into review when the code timer naturally expires
  useEffect(() => {
    if (codeSession.expired && codeSession.activeCode && !codeReviewing) {
      setCodeReviewing(true);
    }
  }, [codeSession.expired, codeSession.activeCode, codeReviewing]);

  // Initialize manual marks when course loads / changes
  useEffect(() => {
    if (!course) {
      setManualMarks({});
      return;
    }
    setManualMarks((prev) => {
      const next: Record<string, boolean> = {};
      for (const s of course.enrolledStudents) {
        next[s.id] = prev[s.id] ?? false;
      }
      return next;
    });
  }, [course]);

  const [submitting, setSubmitting] = useState<null | 'bluetooth' | 'code' | 'manual'>(null);

  // ----------------------------------------------------------- Bluetooth flow

  const handleStartBroadcast = useCallback(() => {
    Alert.alert(
      'Turn on Bluetooth',
      "Make sure your phone's Bluetooth is ON before continuing. Without it, students nearby cannot detect your device.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            setBtReviewing(false);
            btRoster.reset();
            await broadcast.start(courseId);
          },
        },
      ],
    );
  }, [broadcast, btRoster, courseId]);

  const handleStopBroadcast = async () => {
    await broadcast.stop(courseId);
    setBtReviewing(true);
  };

  const handleAcceptBluetooth = async () => {
    if (!course) return;
    setSubmitting('bluetooth');
    try {
      await submitManualAttendance(courseId, btRoster.toRecords());
      Alert.alert(
        'Attendance saved',
        `Marked ${btRoster.presentCount} of ${btRoster.totalCount} students present.`,
        [{ text: 'OK', onPress: () => router.replace('/(teacher)') }],
      );
      btRoster.reset();
      setBtReviewing(false);
    } catch (e) {
      Alert.alert('Submit failed', e instanceof Error ? e.message : 'Could not save attendance.');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDiscardBluetooth = () => {
    Alert.alert(
      'Discard session?',
      'Throw away the session without saving any attendance?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            btRoster.reset();
            setBtReviewing(false);
          },
        },
      ],
    );
  };

  // ----------------------------------------------------------- Code flow

  const handleStartCode = async () => {
    setCodeReviewing(false);
    codeRoster.reset();
    await codeSession.start(typedCode);
  };

  const handleStopCodeSession = useCallback(() => {
    setCodeReviewing(true);
  }, []);

  const handleAcceptCode = async () => {
    if (!course) return;
    setSubmitting('code');
    try {
      await submitManualAttendance(courseId, codeRoster.toRecords());
      Alert.alert(
        'Attendance saved',
        `Marked ${codeRoster.presentCount} of ${codeRoster.totalCount} students present.`,
        [{ text: 'OK', onPress: () => router.replace('/(teacher)') }],
      );
      codeSession.reset();
      codeRoster.reset();
      setCodeReviewing(false);
      setTypedCode(generateAttendanceCode());
    } catch (e) {
      Alert.alert('Submit failed', e instanceof Error ? e.message : 'Could not save attendance.');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDiscardCode = () => {
    Alert.alert(
      'Discard session?',
      'Throw away the session without saving any attendance?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            codeSession.reset();
            codeRoster.reset();
            setCodeReviewing(false);
            setTypedCode(generateAttendanceCode());
          },
        },
      ],
    );
  };

  // ----------------------------------------------------------- Manual flow

  const setManualMark = (studentId: string, present: boolean) => {
    setManualMarks((prev) => ({ ...prev, [studentId]: present }));
  };

  const manualPresent = Object.values(manualMarks).filter(Boolean).length;
  const manualTotal = course?.enrolledStudents.length ?? 0;
  const manualAbsent = manualTotal - manualPresent;

  const handleSubmitManual = async () => {
    if (!course) return;
    setSubmitting('manual');
    try {
      const records = Object.entries(manualMarks).map(([studentId, present]) => ({
        studentId,
        present,
      }));
      await submitManualAttendance(courseId, records);
      Alert.alert(
        'Attendance saved',
        `Marked ${manualPresent} of ${manualTotal} students present.`,
        [{ text: 'OK', onPress: () => router.replace('/(teacher)') }],
      );
    } catch (e) {
      Alert.alert('Submit failed', e instanceof Error ? e.message : 'Could not save attendance.');
    } finally {
      setSubmitting(null);
    }
  };

  // ----------------------------------------------------------- Render

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

  const btPhase: 'idle' | 'active' | 'review' = btReviewing
    ? 'review'
    : broadcast.broadcasting
    ? 'active'
    : 'idle';

  const codePhase: 'idle' | 'active' | 'review' = codeReviewing
    ? 'review'
    : codeSession.activeCode !== null && !codeSession.expired
    ? 'active'
    : 'idle';

  const inReview =
    (tab === 'bluetooth' && btPhase === 'review') ||
    (tab === 'code' && codePhase === 'review');

  const reviewPresent =
    tab === 'bluetooth' ? btRoster.presentCount : codeRoster.presentCount;
  const reviewAbsent =
    tab === 'bluetooth' ? btRoster.absentCount : codeRoster.absentCount;
  const reviewTotal =
    tab === 'bluetooth' ? btRoster.totalCount : codeRoster.totalCount;

  const filteredManualStudents = course.enrolledStudents.filter((s) => {
    if (filter === 'all') return true;
    const present = manualMarks[s.id];
    return filter === 'present' ? present : !present;
  });

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
            Take attendance
          </Text>
          <Text className="text-slate-400 text-xs">
            {course.name} · {course.code}
          </Text>
        </View>
      </View>

      {/* Floating review header — Accept/Discard sticky at top during review */}
      {inReview ? (
        <View className="px-5 pt-3 pb-3 bg-slate-900 border-b border-slate-800">
          <View className="rounded-xl bg-emerald-600/15 border border-emerald-600/40 p-3 mb-3">
            <Text className="text-emerald-300 text-xs">
              Session ended. Review the list (absent first), then Accept to save.
            </Text>
          </View>
          <View className="flex-row mb-3">
            <StatPill label="Present" value={reviewPresent} tone="good" />
            <StatPill label="Absent" value={reviewAbsent} tone="danger" />
            <StatPill label="Total" value={reviewTotal} tone="neutral" />
          </View>
          <View className="flex-row">
            <Pressable
              onPress={tab === 'bluetooth' ? handleDiscardBluetooth : handleDiscardCode}
              disabled={submitting !== null}
              className={`flex-1 mr-2 rounded-xl bg-slate-700 py-3 items-center ${
                submitting !== null ? 'opacity-60' : 'active:opacity-80'
              }`}
            >
              <Text className="text-white font-semibold">Discard</Text>
            </Pressable>
            <Pressable
              onPress={tab === 'bluetooth' ? handleAcceptBluetooth : handleAcceptCode}
              disabled={submitting !== null}
              className={`flex-1 ml-2 rounded-xl bg-emerald-600 py-3 items-center ${
                submitting !== null ? 'opacity-60' : 'active:opacity-80'
              }`}
            >
              {submitting === tab ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold">Accept</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <ScrollView className="flex-1 px-5 pt-4">
        {/* Tabs */}
        <View className="flex-row bg-slate-800 rounded-2xl p-1 mb-4">
          {(['bluetooth', 'code', 'manual'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl items-center ${
                tab === t ? 'bg-sky-600' : ''
              }`}
            >
              <Text
                className={`text-sm font-semibold capitalize ${
                  tab === t ? 'text-white' : 'text-slate-400'
                }`}
              >
                {t}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* BLUETOOTH TAB */}
        {tab === 'bluetooth' ? (
          <View className="bg-slate-800 rounded-2xl p-5 mb-4">
            <Text className="text-white text-base font-semibold mb-1">
              Bluetooth detection
            </Text>
            <Text className="text-slate-400 text-xs mb-4">
              Students nearby will be detected automatically. Override to prevent cheating.
            </Text>

            {btPhase === 'idle' ? (
              <View>
                <View className="items-center py-4">
                  <BluetoothScanner active={false} />
                </View>
                <ErrorMessage message={broadcast.error} />
                <Pressable
                  onPress={handleStartBroadcast}
                  disabled={broadcast.starting}
                  className={`rounded-xl bg-sky-600 py-3 items-center ${
                    broadcast.starting ? 'opacity-60' : 'active:opacity-80'
                  }`}
                >
                  <Text className="text-white font-semibold">
                    {broadcast.starting ? 'Starting…' : 'Start broadcasting'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {btPhase === 'active' ? (
              <View>
                <View className="items-center py-3">
                  <BluetoothScanner active label="Broadcasting…" size={120} />
                </View>
                {broadcast.fallback ? (
                  <Text className="text-amber-300 text-xs text-center mb-2">
                    Native BLE advertising unavailable — using server fallback.
                  </Text>
                ) : null}
                <View className="flex-row mb-3">
                  <StatPill label="Present" value={btRoster.presentCount} tone="good" />
                  <StatPill label="Absent" value={btRoster.absentCount} tone="danger" />
                  <StatPill label="Total" value={btRoster.totalCount} tone="neutral" />
                </View>
                <RosterList
                  students={btRoster.enrolledOrder}
                  marks={btRoster.marks}
                  onToggle={btRoster.setMark}
                />
                <Pressable
                  onPress={handleStopBroadcast}
                  className="rounded-xl bg-red-600 py-3 items-center active:opacity-80 mt-3"
                >
                  <Text className="text-white font-semibold">Stop broadcasting</Text>
                </Pressable>
              </View>
            ) : null}

            {btPhase === 'review' ? (
              <RosterList
                students={btRoster.sortedAbsentFirst}
                marks={btRoster.marks}
                onToggle={btRoster.setMark}
              />
            ) : null}
          </View>
        ) : null}

        {/* CODE TAB */}
        {tab === 'code' ? (
          <View className="bg-slate-800 rounded-2xl p-5 mb-4">
            {codePhase === 'idle' ? (
              <View>
                <Text className="text-white text-base font-semibold mb-1">
                  Instructor code
                </Text>
                <Text className="text-slate-400 text-xs mb-4">
                  A code has been generated for you. Tap Launch to start the {CODE_DURATION_SECONDS}-second session, or edit it first.
                </Text>

                <TextInput
                  value={typedCode}
                  onChangeText={(t) => setTypedCode(t.toUpperCase().slice(0, 6))}
                  placeholder="ABC123"
                  placeholderTextColor="#475569"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                  className="bg-slate-950 text-white rounded-xl px-4 py-5 text-center text-3xl font-mono"
                  style={{ letterSpacing: 6 }}
                />

                <View className="flex-row mt-3">
                  <Pressable
                    onPress={() => setTypedCode(generateAttendanceCode())}
                    disabled={codeSession.starting}
                    className="flex-1 mr-2 rounded-xl bg-slate-700 py-3 items-center active:opacity-80"
                  >
                    <Text className="text-white font-semibold">Re-generate</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleStartCode}
                    disabled={typedCode.length !== 6 || codeSession.starting}
                    className={`flex-1 ml-2 rounded-xl py-3 items-center ${
                      typedCode.length === 6 && !codeSession.starting
                        ? 'bg-emerald-600 active:opacity-80'
                        : 'bg-slate-700 opacity-60'
                    }`}
                  >
                    {codeSession.starting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white font-semibold">Launch</Text>
                    )}
                  </Pressable>
                </View>

                <ErrorMessage message={codeSession.startError} />
              </View>
            ) : null}

            {codePhase === 'active' && codeSession.activeCode ? (
              <View>
                <AttendanceCodeDisplay
                  code={codeSession.activeCode}
                  secondsLeft={codeSession.secondsLeft}
                  totalSeconds={CODE_DURATION_SECONDS}
                  onStop={handleStopCodeSession}
                />
                <View className="mt-4">
                  <View className="flex-row mb-3">
                    <StatPill label="Present" value={codeRoster.presentCount} tone="good" />
                    <StatPill label="Absent" value={codeRoster.absentCount} tone="danger" />
                    <StatPill label="Total" value={codeRoster.totalCount} tone="neutral" />
                  </View>
                  <RosterList
                    students={codeRoster.enrolledOrder}
                    marks={codeRoster.marks}
                    onToggle={codeRoster.setMark}
                  />
                </View>
              </View>
            ) : null}

            {codePhase === 'review' ? (
              <RosterList
                students={codeRoster.sortedAbsentFirst}
                marks={codeRoster.marks}
                onToggle={codeRoster.setMark}
              />
            ) : null}
          </View>
        ) : null}

        {/* MANUAL TAB */}
        {tab === 'manual' ? (
          <View className="bg-slate-800 rounded-2xl p-4 mb-4">
            <Text className="text-white text-base font-semibold mb-3">Manual marking</Text>

            <View className="flex-row mb-3">
              {(['all', 'present', 'absent'] as const).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-full mr-2 ${
                    filter === f ? 'bg-sky-600' : 'bg-slate-700'
                  } active:opacity-80`}
                >
                  <Text className="text-white text-xs font-semibold capitalize">{f}</Text>
                </Pressable>
              ))}
            </View>

            <View className="flex-row mb-3">
              <StatPill label="Present" value={manualPresent} tone="good" />
              <StatPill label="Absent" value={manualAbsent} tone="danger" />
              <StatPill label="Total" value={manualTotal} tone="neutral" />
            </View>

            {course.enrolledStudents.length === 0 ? (
              <Text className="text-slate-500 text-sm py-4">No students enrolled yet.</Text>
            ) : (
              filteredManualStudents.map((s) => (
                <StudentListItem
                  key={s.id}
                  student={s}
                  mode="mark"
                  present={manualMarks[s.id] ?? false}
                  onMarkPresent={() => setManualMark(s.id, true)}
                  onMarkAbsent={() => setManualMark(s.id, false)}
                />
              ))
            )}

            <Pressable
              onPress={handleSubmitManual}
              disabled={submitting !== null || course.enrolledStudents.length === 0}
              className={`rounded-xl bg-emerald-600 py-3 items-center mt-3 ${
                submitting !== null ? 'opacity-60' : 'active:opacity-80'
              }`}
            >
              {submitting === 'manual' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold">Submit attendance</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <View className="h-16" />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------- Local sub-components ----------

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'danger' | 'neutral';
}): JSX.Element {
  const bg =
    tone === 'good'
      ? 'bg-emerald-600/20'
      : tone === 'danger'
      ? 'bg-red-600/20'
      : 'bg-slate-700';
  const fg =
    tone === 'good'
      ? 'text-emerald-300'
      : tone === 'danger'
      ? 'text-red-300'
      : 'text-slate-200';
  return (
    <View className={`flex-1 mx-1 rounded-xl py-2.5 items-center ${bg}`}>
      <Text className={`text-xs ${fg}`}>{label}</Text>
      <Text className={`text-xl font-bold mt-0.5 ${fg}`}>{value}</Text>
    </View>
  );
}

function RosterList({
  students,
  marks,
  onToggle,
}: {
  students: Student[];
  marks: Record<string, boolean>;
  onToggle: (studentId: string, present: boolean) => void;
}): JSX.Element {
  if (students.length === 0) {
    return (
      <Text className="text-slate-500 text-sm py-3">No students enrolled yet.</Text>
    );
  }
  return (
    <View>
      {students.map((s) => (
        <StudentListItem
          key={s.id}
          student={s}
          mode="mark"
          present={marks[s.id] ?? false}
          onMarkPresent={() => onToggle(s.id, true)}
          onMarkAbsent={() => onToggle(s.id, false)}
        />
      ))}
    </View>
  );
}

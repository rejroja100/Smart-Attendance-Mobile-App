import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCourse } from '@/hooks/useCourses';
import {
  useCodeSession,
  useManualAttendance,
  useCourseAttendance,
  useSessionRoster,
} from '@/hooks/useAttendance';
import { useTeacherBroadcast } from '@/hooks/useBluetooth';
import {
  exportAttendance,
  removeStudent as apiRemoveStudent,
  submitManualAttendance,
} from '@/services/api';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorMessage } from '@/components/ErrorMessage';
import { AttendanceCodeDisplay } from '@/components/AttendanceCodeDisplay';
import { BluetoothScanner } from '@/components/BluetoothScanner';
import { StudentListItem } from '@/components/StudentListItem';
import { ExportButton } from '@/components/ExportButton';
import { CODE_DURATION_SECONDS } from '@/utils/constants';
import { enrollLink, formatDate } from '@/utils/helpers';
import type { Student } from '@/types';

// Convert an ArrayBuffer to a base64 string without depending on the `buffer` package.
// React Native (Hermes) provides `btoa` globally; if it ever isn't there we fall back to a manual encode.
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (typeof g.btoa === 'function') {
    return g.btoa(binary);
  }
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++] ?? 0;
    const b2 = bytes[i++] ?? 0;
    const b3 = bytes[i++] ?? 0;
    out +=
      B64_CHARS[b1 >> 2] +
      B64_CHARS[((b1 & 0x03) << 4) | (b2 >> 4)] +
      (i - 1 < bytes.length ? B64_CHARS[((b2 & 0x0f) << 2) | (b3 >> 6)] : '=') +
      (i < bytes.length ? B64_CHARS[b3 & 0x3f] : '=');
  }
  return out;
}

type Tab = 'bluetooth' | 'code' | 'manual';
type Filter = 'all' | 'present' | 'absent';

export default function TeacherCourseDetail(): JSX.Element {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = id ?? '';
  const { course, loading, error, refresh, setCourse } = useCourse(courseId);

  const [tab, setTab] = useState<Tab>('code');

  // Code session
  const codeSession = useCodeSession(courseId);
  const [typedCode, setTypedCode] = useState('');

  // Manual tab marking (unchanged)
  const manual = useManualAttendance(course);
  const [filter, setFilter] = useState<Filter>('all');

  // Bluetooth broadcast
  const broadcast = useTeacherBroadcast();

  // "Review" flags — true after the teacher stops the session (or the code
  // timer naturally expires). Review phase shows the sorted roster + counts
  // + Accept/Discard buttons.
  const [btReviewing, setBtReviewing] = useState(false);
  const [codeReviewing, setCodeReviewing] = useState(false);

  // Poll today's attendance records while either session is active so auto-marks
  // can flow into both rosters in near real-time.
  const sessionRunning =
    broadcast.broadcasting ||
    (codeSession.activeCode !== null && !codeSession.expired);
  const live = useCourseAttendance(courseId, sessionRunning ? 4000 : null);

  // Shared rosters — one per method. Each watches its own method's records.
  const btRoster = useSessionRoster(course, live.records ?? {}, 'bluetooth');
  const codeRoster = useSessionRoster(course, live.records ?? {}, 'code');

  // When the code timer naturally expires (40s tick), auto-transition into review.
  useEffect(() => {
    if (codeSession.expired && codeSession.activeCode && !codeReviewing) {
      setCodeReviewing(true);
    }
  }, [codeSession.expired, codeSession.activeCode, codeReviewing]);

  // Submit-in-progress flag for the Accept buttons.
  const [submitting, setSubmitting] = useState<null | 'bluetooth' | 'code'>(null);

  // Export
  const [downloading, setDownloading] = useState<'xlsx' | 'csv' | null>(null);

  // Enrolled students panel
  const [studentsExpanded, setStudentsExpanded] = useState(false);

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(enrollLink(courseId));
    Alert.alert('Copied', 'Enrollment link copied to clipboard.');
  };

  const handleShareLink = async () => {
    try {
      await Share.share({
        message: `Join my course "${course?.name}" on Smart Attendance: ${enrollLink(courseId)}`,
      });
    } catch {
      // ignore
    }
  };

  const handleStartCode = async () => {
    setCodeReviewing(false);
    codeRoster.reset();
    await codeSession.start(typedCode);
  };

  const handleStopCodeSession = useCallback(() => {
    // Don't call codeSession.stop() — that nukes activeCode and the
    // useEffect would put us back in idle. Just enter review; the
    // timer keeps ticking but the UI ignores it.
    setCodeReviewing(true);
  }, []);

  const handleAcceptCode = async () => {
    if (!course) return;
    setSubmitting('code');
    try {
      await submitManualAttendance(courseId, codeRoster.toRecords());
      Alert.alert(
        'Saved',
        `Marked ${codeRoster.presentCount} of ${codeRoster.totalCount} students present.`,
      );
      codeSession.reset();
      codeRoster.reset();
      setCodeReviewing(false);
      setTypedCode('');
      await live.refresh();
    } catch (e) {
      Alert.alert(
        'Submit failed',
        e instanceof Error ? e.message : 'Could not save attendance.',
      );
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
            setTypedCode('');
          },
        },
      ],
    );
  };

  const handleStartBroadcast = async () => {
    setBtReviewing(false);
    btRoster.reset();
    await broadcast.start(courseId);
  };

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
        'Saved',
        `Marked ${btRoster.presentCount} of ${btRoster.totalCount} students present.`,
      );
      btRoster.reset();
      setBtReviewing(false);
      await live.refresh();
    } catch (e) {
      Alert.alert(
        'Submit failed',
        e instanceof Error ? e.message : 'Could not save attendance.',
      );
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

  const handleSubmitManual = async () => {
    const ok = await manual.submit(courseId);
    if (ok) {
      Alert.alert('Saved', `Marked ${manual.presentCount} of ${manual.totalCount} students present.`);
    }
  };

  const handleDownload = async (format: 'xlsx' | 'csv') => {
    if (!course) return;
    setDownloading(format);
    try {
      const result = await exportAttendance(courseId, format);
      const base64 = arrayBufferToBase64(result.data);
      const filename = `attendance_${course.code}_${formatDate(new Date())}.${format}`;
      const uri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: result.contentType,
          dialogTitle: filename,
          UTI: format === 'xlsx' ? 'org.openxmlformats.spreadsheetml.sheet' : 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Saved', `File saved to:\n${uri}`);
      }
    } catch (e) {
      Alert.alert('Download failed', 'Check your connection and try again.');
    } finally {
      setDownloading(null);
    }
  };

  const handleRemoveStudent = (student: Student) => {
    Alert.alert(
      'Remove student',
      `Remove ${student.name} from this course?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiRemoveStudent(courseId, student.id);
              if (course) {
                setCourse({
                  ...course,
                  studentIds: course.studentIds.filter((sid) => sid !== student.id),
                  enrolledStudents: course.enrolledStudents.filter(
                    (s) => s.id !== student.id,
                  ),
                });
              }
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove student.');
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

  const filteredStudents = course.enrolledStudents.filter((s) => {
    if (filter === 'all') return true;
    const present = manual.marks[s.id];
    return filter === 'present' ? present : !present;
  });

  // Bluetooth tab phase
  const btPhase: 'idle' | 'active' | 'review' = btReviewing
    ? 'review'
    : broadcast.broadcasting
    ? 'active'
    : 'idle';

  // Code tab phase
  const codePhase: 'idle' | 'active' | 'review' = codeReviewing
    ? 'review'
    : codeSession.activeCode !== null && !codeSession.expired
    ? 'active'
    : 'idle';

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
          <Text className="text-slate-400 text-xs">{course.code}</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={refresh} tintColor="#38bdf8" />
        }
      >
        {/* Enrollment link */}
        <View className="bg-slate-800 rounded-2xl p-4 mb-4">
          <Text className="text-slate-400 text-xs uppercase tracking-widest mb-2">
            Enrollment link
          </Text>
          <Text className="text-white text-sm" numberOfLines={1}>
            {enrollLink(courseId)}
          </Text>
          <View className="flex-row mt-3">
            <Pressable
              onPress={handleCopyLink}
              className="flex-1 mr-2 rounded-xl bg-slate-700 py-2.5 items-center active:opacity-80"
            >
              <Text className="text-white font-semibold text-sm">Copy</Text>
            </Pressable>
            <Pressable
              onPress={handleShareLink}
              className="flex-1 ml-2 rounded-xl bg-sky-600 py-2.5 items-center active:opacity-80"
            >
              <Text className="text-white font-semibold text-sm">Share</Text>
            </Pressable>
          </View>
        </View>

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
              Students nearby will be detected automatically. Override their status to prevent cheating.
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
                    {broadcast.starting ? 'Starting…' : 'Start Broadcasting'}
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
                    Native BLE advertising unavailable on this device — using server fallback.
                  </Text>
                ) : null}
                <SessionStats
                  present={btRoster.presentCount}
                  absent={btRoster.absentCount}
                  total={btRoster.totalCount}
                />
                <RosterList
                  students={btRoster.enrolledOrder}
                  marks={btRoster.marks}
                  onToggle={btRoster.setMark}
                />
                <Pressable
                  onPress={handleStopBroadcast}
                  className="rounded-xl bg-red-600 py-3 items-center active:opacity-80 mt-3"
                >
                  <Text className="text-white font-semibold">Stop Broadcasting</Text>
                </Pressable>
              </View>
            ) : null}

            {btPhase === 'review' ? (
              <View>
                <View className="rounded-xl bg-emerald-600/15 border border-emerald-600/40 p-3 mb-3">
                  <Text className="text-emerald-300 text-xs">
                    Session ended. Review the list — absent students first. Tap Accept to save attendance.
                  </Text>
                </View>
                <SessionStats
                  present={btRoster.presentCount}
                  absent={btRoster.absentCount}
                  total={btRoster.totalCount}
                />
                <RosterList
                  students={btRoster.sortedAbsentFirst}
                  marks={btRoster.marks}
                  onToggle={btRoster.setMark}
                />
                <View className="flex-row mt-3">
                  <Pressable
                    onPress={handleDiscardBluetooth}
                    disabled={submitting !== null}
                    className={`flex-1 mr-2 rounded-xl bg-slate-700 py-3 items-center ${
                      submitting !== null ? 'opacity-60' : 'active:opacity-80'
                    }`}
                  >
                    <Text className="text-white font-semibold">Discard</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleAcceptBluetooth}
                    disabled={submitting !== null}
                    className={`flex-1 ml-2 rounded-xl bg-emerald-600 py-3 items-center ${
                      submitting !== null ? 'opacity-60' : 'active:opacity-80'
                    }`}
                  >
                    {submitting === 'bluetooth' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white font-semibold">Accept Attendance</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* CODE TAB */}
        {tab === 'code' ? (
          <View className="mb-4">
            {codePhase === 'idle' ? (
              <View className="bg-slate-800 rounded-2xl p-5">
                <Text className="text-white text-base font-semibold mb-1">
                  Instructor code
                </Text>
                <Text className="text-slate-400 text-xs mb-4">
                  Create a 6-character code and share it with students. The code expires after {CODE_DURATION_SECONDS} seconds.
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

                <ErrorMessage message={codeSession.startError} />

                <Pressable
                  onPress={handleStartCode}
                  disabled={typedCode.length !== 6 || codeSession.starting}
                  className={`mt-4 rounded-xl py-3 items-center ${
                    typedCode.length === 6 && !codeSession.starting
                      ? 'bg-emerald-600 active:opacity-80'
                      : 'bg-slate-700 opacity-60'
                  }`}
                >
                  {codeSession.starting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold">Start Session</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {codePhase === 'active' && codeSession.activeCode ? (
              <View className="bg-slate-800 rounded-2xl p-5">
                <AttendanceCodeDisplay
                  code={codeSession.activeCode}
                  secondsLeft={codeSession.secondsLeft}
                  totalSeconds={CODE_DURATION_SECONDS}
                  onStop={handleStopCodeSession}
                />
                <View className="mt-4">
                  <SessionStats
                    present={codeRoster.presentCount}
                    absent={codeRoster.absentCount}
                    total={codeRoster.totalCount}
                  />
                  <RosterList
                    students={codeRoster.enrolledOrder}
                    marks={codeRoster.marks}
                    onToggle={codeRoster.setMark}
                  />
                </View>
              </View>
            ) : null}

            {codePhase === 'review' ? (
              <View className="bg-slate-800 rounded-2xl p-5">
                <View className="rounded-xl bg-emerald-600/15 border border-emerald-600/40 p-3 mb-3">
                  <Text className="text-emerald-300 text-xs">
                    Code session ended. Review the list — absent students first. Tap Accept to save attendance.
                  </Text>
                </View>
                <SessionStats
                  present={codeRoster.presentCount}
                  absent={codeRoster.absentCount}
                  total={codeRoster.totalCount}
                />
                <RosterList
                  students={codeRoster.sortedAbsentFirst}
                  marks={codeRoster.marks}
                  onToggle={codeRoster.setMark}
                />
                <View className="flex-row mt-3">
                  <Pressable
                    onPress={handleDiscardCode}
                    disabled={submitting !== null}
                    className={`flex-1 mr-2 rounded-xl bg-slate-700 py-3 items-center ${
                      submitting !== null ? 'opacity-60' : 'active:opacity-80'
                    }`}
                  >
                    <Text className="text-white font-semibold">Discard</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleAcceptCode}
                    disabled={submitting !== null}
                    className={`flex-1 ml-2 rounded-xl bg-emerald-600 py-3 items-center ${
                      submitting !== null ? 'opacity-60' : 'active:opacity-80'
                    }`}
                  >
                    {submitting === 'code' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white font-semibold">Accept Attendance</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* MANUAL TAB */}
        {tab === 'manual' ? (
          <View className="bg-slate-800 rounded-2xl p-4 mb-4">
            <Text className="text-white text-base font-semibold mb-3">
              Manual marking
            </Text>

            <View className="flex-row mb-3">
              {(['all', 'present', 'absent'] as const).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-full mr-2 ${
                    filter === f ? 'bg-sky-600' : 'bg-slate-700'
                  } active:opacity-80`}
                >
                  <Text className="text-white text-xs font-semibold capitalize">
                    {f}
                  </Text>
                </Pressable>
              ))}
            </View>

            {course.enrolledStudents.length === 0 ? (
              <Text className="text-slate-500 text-sm py-4">
                No students enrolled yet.
              </Text>
            ) : (
              filteredStudents.map((s) => (
                <StudentListItem
                  key={s.id}
                  student={s}
                  mode="mark"
                  present={manual.marks[s.id] ?? false}
                  onMarkPresent={() => manual.setMark(s.id, true)}
                  onMarkAbsent={() => manual.setMark(s.id, false)}
                />
              ))
            )}

            <Text className="text-slate-300 text-sm font-semibold mt-3 mb-2 text-center">
              Present: {manual.presentCount} / {manual.totalCount} students
            </Text>

            <ErrorMessage message={manual.error} />

            <Pressable
              onPress={handleSubmitManual}
              disabled={manual.submitting || course.enrolledStudents.length === 0}
              className={`rounded-xl bg-emerald-600 py-3 items-center ${
                manual.submitting ? 'opacity-60' : 'active:opacity-80'
              }`}
            >
              {manual.submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold">Submit Attendance</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {/* EXPORT */}
        <View className="bg-slate-800 rounded-2xl p-4 mb-4">
          <Text className="text-white text-base font-semibold mb-3">
            Export Attendance Report
          </Text>
          <View className="flex-row -mx-1">
            <ExportButton
              format="xlsx"
              loading={downloading === 'xlsx'}
              disabled={downloading !== null}
              onPress={() => handleDownload('xlsx')}
            />
            <ExportButton
              format="csv"
              loading={downloading === 'csv'}
              disabled={downloading !== null}
              onPress={() => handleDownload('csv')}
            />
          </View>
        </View>

        {/* ENROLLED STUDENTS PANEL */}
        <Pressable
          onPress={() => setStudentsExpanded((v) => !v)}
          className="bg-slate-800 rounded-2xl p-4 mb-4 flex-row items-center active:opacity-90"
        >
          <View className="flex-1">
            <Text className="text-white font-semibold">
              Enrolled students ({course.enrolledStudents.length})
            </Text>
            <Text className="text-slate-400 text-xs mt-0.5">
              {studentsExpanded ? 'Tap to collapse' : 'Tap to expand'}
            </Text>
          </View>
          <Text className="text-white text-lg">{studentsExpanded ? '▾' : '▸'}</Text>
        </Pressable>

        {studentsExpanded ? (
          <View className="mb-6">
            {course.enrolledStudents.length === 0 ? (
              <Text className="text-slate-500 text-sm">No students enrolled yet.</Text>
            ) : (
              course.enrolledStudents.map((s) => (
                <StudentListItem
                  key={s.id}
                  student={s}
                  mode="view"
                  onRemove={() => handleRemoveStudent(s)}
                />
              ))
            )}
          </View>
        ) : null}

        <View className="h-12" />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------- Local sub-components ----------

function SessionStats({
  present,
  absent,
  total,
}: {
  present: number;
  absent: number;
  total: number;
}): JSX.Element {
  return (
    <View className="flex-row mb-3">
      <StatPill label="Present" value={present} tone="good" />
      <StatPill label="Absent" value={absent} tone="danger" />
      <StatPill label="Total" value={total} tone="neutral" />
    </View>
  );
}

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
      <Text className="text-slate-500 text-sm py-3">
        No students enrolled yet.
      </Text>
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

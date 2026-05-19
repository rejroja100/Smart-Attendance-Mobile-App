import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCourse } from '@/hooks/useCourses';
import {
  exportAttendance,
  removeStudent as apiRemoveStudent,
  deleteCourse as apiDeleteCourse,
} from '@/services/api';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorMessage } from '@/components/ErrorMessage';
import { StudentListItem } from '@/components/StudentListItem';
import { ExportButton } from '@/components/ExportButton';
import { enrollLink, formatDate } from '@/utils/helpers';
import type { Student } from '@/types';

// Inline ArrayBuffer → base64 to avoid pulling in the `buffer` npm dependency.
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
  if (typeof g.btoa === 'function') return g.btoa(binary);
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

export default function TeacherCourseDetail(): JSX.Element {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = id ?? '';
  const { course, loading, error, refresh, setCourse } = useCourse(courseId);

  const [downloading, setDownloading] = useState<'xlsx' | 'csv' | null>(null);
  const [studentsExpanded, setStudentsExpanded] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(false);

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

  const handleTakeAttendance = () => {
    router.push(`/(teacher)/attendance/${courseId}` as never);
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
          UTI: format === 'xlsx'
            ? 'org.openxmlformats.spreadsheetml.sheet'
            : 'public.comma-separated-values-text',
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
              Alert.alert(
                'Error',
                e instanceof Error ? e.message : 'Failed to remove student.',
              );
            }
          },
        },
      ],
    );
  };

  const handleDeleteCourse = () => {
    if (!course) return;
    Alert.alert(
      'Delete this course?',
      `"${course.name}" (${course.code}), all enrolled students, and the full attendance history will be permanently removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              `Type-check: this will delete "${course.code}" forever.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete',
                  style: 'destructive',
                  onPress: async () => {
                    setDeletingCourse(true);
                    try {
                      await apiDeleteCourse(courseId);
                      router.replace('/(teacher)');
                    } catch (e) {
                      Alert.alert(
                        'Could not delete course',
                        e instanceof Error ? e.message : 'Please try again.',
                      );
                      setDeletingCourse(false);
                    }
                  },
                },
              ],
            );
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
        {/* TAKE ATTENDANCE — primary action */}
        <Pressable
          onPress={handleTakeAttendance}
          className="rounded-2xl bg-sky-600 p-5 mb-4 flex-row items-center active:opacity-90"
        >
          <View className="w-12 h-12 rounded-xl bg-white/15 items-center justify-center">
            <Text className="text-2xl">📋</Text>
          </View>
          <View className="flex-1 ml-3">
            <Text className="text-white text-base font-bold">Take attendance</Text>
            <Text className="text-white/80 text-xs mt-0.5">
              Start a Bluetooth, code, or manual session
            </Text>
          </View>
          <Text className="text-white text-xl">→</Text>
        </Pressable>

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

        {/* Export */}
        <View className="bg-slate-800 rounded-2xl p-4 mb-4">
          <Text className="text-white text-base font-semibold mb-3">
            Export attendance report
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

        {/* Enrolled students */}
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

        {/* DANGER ZONE — Delete course */}
        <View className="rounded-2xl border border-red-600/40 bg-red-600/10 p-4 mb-4">
          <Text className="text-red-300 text-xs uppercase tracking-widest mb-2 font-semibold">
            Danger zone
          </Text>
          <Text className="text-slate-300 text-sm mb-3">
            Delete this course and all of its attendance history. This action is permanent and cannot be undone.
          </Text>
          <Pressable
            onPress={handleDeleteCourse}
            disabled={deletingCourse}
            className={`rounded-xl bg-red-600 py-3 items-center ${
              deletingCourse ? 'opacity-60' : 'active:opacity-80'
            }`}
          >
            {deletingCourse ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">Delete this course</Text>
            )}
          </Pressable>
        </View>

        <View className="h-12" />
      </ScrollView>
    </SafeAreaView>
  );
}

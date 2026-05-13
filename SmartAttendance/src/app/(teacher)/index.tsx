import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { useCourses } from '@/hooks/useCourses';
import { CourseCard } from '@/components/CourseCard';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorMessage } from '@/components/ErrorMessage';
import type { Course } from '@/types';

export default function TeacherHome(): JSX.Element {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const {
    courses,
    loading,
    refreshing,
    error,
    refresh,
    createCourse,
    deleteCourse,
  } = useCourses('teacher');

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const totalStudents = useMemo(
    () => courses.reduce((acc, c) => acc + (c.studentIds?.length ?? 0), 0),
    [courses],
  );

  const handleDeleteCourse = (course: Course) => {
    Alert.alert(
      'Remove course?',
      `"${course.name}" (${course.code}) and all of its attendance history will be permanently deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCourse(course.id);
            } catch (e) {
              Alert.alert(
                'Could not remove course',
                e instanceof Error ? e.message : 'Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (!name.trim() || !code.trim()) {
      setCreateError('Please enter both a name and a code.');
      return;
    }
    setCreating(true);
    try {
      await createCourse(name.trim(), code.trim());
      setName('');
      setCode('');
      setModalOpen(false);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create course.');
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.replace('/(auth)/role-selection');
  };

  if (loading) return <LoadingScreen message="Loading your courses…" />;

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <View className="px-5 pt-2 flex-row items-center">
        <Text className="text-white text-lg font-bold">Smart Attendance</Text>
        <View className="ml-2 px-2 py-0.5 rounded-full bg-teal-600/20">
          <Text className="text-teal-300 text-[10px] font-semibold tracking-widest">
            TEACHER
          </Text>
        </View>
        <View className="flex-1" />
        <Pressable
          onPress={() => router.push('/(teacher)/profile')}
          className="w-10 h-10 rounded-full bg-slate-800 items-center justify-center active:opacity-80 mr-2"
        >
          <Text className="text-white">👤</Text>
        </Pressable>
        <Pressable
          onPress={handleLogout}
          className="w-10 h-10 rounded-full bg-slate-800 items-center justify-center active:opacity-80"
        >
          <Text className="text-white">⎋</Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-3"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor="#38bdf8"
          />
        }
      >
        <View className="px-1">
          <Text className="text-slate-400 text-sm">Welcome,</Text>
          <Text className="text-white text-2xl font-bold">
            {user?.name ?? 'Teacher'}
          </Text>
        </View>

        <View className="flex-row mt-4">
          <View className="flex-1 mr-2 bg-slate-800 rounded-2xl p-4">
            <Text className="text-slate-400 text-xs">Courses</Text>
            <Text className="text-white text-2xl font-bold mt-1">
              {courses.length}
            </Text>
          </View>
          <View className="flex-1 ml-2 bg-slate-800 rounded-2xl p-4">
            <Text className="text-slate-400 text-xs">Total students</Text>
            <Text className="text-white text-2xl font-bold mt-1">
              {totalStudents}
            </Text>
          </View>
        </View>

        <Text className="text-slate-300 text-base font-semibold mt-6 mb-2 px-1">
          Your courses
        </Text>

        <ErrorMessage message={error} onRetry={refresh} />

        {courses.length === 0 ? (
          <View className="items-center mt-12">
            <Text className="text-slate-500 text-4xl">📚</Text>
            <Text className="text-slate-400 mt-3">No courses yet.</Text>
            <Pressable
              onPress={() => setModalOpen(true)}
              className="mt-4 px-4 py-2 rounded-xl bg-sky-600 active:opacity-80"
            >
              <Text className="text-white font-semibold">Create your first course</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row flex-wrap">
            {courses.map((course) => (
              <View key={course.id} className="w-1/2">
                <CourseCard
                  course={course}
                  onPress={() =>
                    router.push(`/(teacher)/course/${course.id}` as never)
                  }
                  onLongPress={() => handleDeleteCourse(course)}
                  onDelete={() => handleDeleteCourse(course)}
                />
              </View>
            ))}
          </View>
        )}

        <View className="h-24" />
      </ScrollView>

      <Pressable
        onPress={() => setModalOpen(true)}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-sky-600 items-center justify-center shadow-lg active:opacity-80"
      >
        <Text className="text-white text-3xl">+</Text>
      </Pressable>

      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/60 justify-end"
          onPress={() => setModalOpen(false)}
        >
          <Pressable className="bg-slate-900 rounded-t-3xl p-5">
            <View className="w-12 h-1.5 rounded-full bg-slate-700 self-center mb-4" />
            <Text className="text-white text-lg font-semibold mb-4">
              New course
            </Text>
            <Text className="text-slate-400 text-xs mb-1">Course name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Operating Systems"
              placeholderTextColor="#475569"
              className="bg-slate-800 text-white rounded-xl px-4 py-3 mb-3"
            />
            <Text className="text-slate-400 text-xs mb-1">Course code</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="e.g. CSE-301"
              placeholderTextColor="#475569"
              autoCapitalize="characters"
              className="bg-slate-800 text-white rounded-xl px-4 py-3"
            />
            <ErrorMessage message={createError} />
            <View className="flex-row mt-4">
              <Pressable
                onPress={() => setModalOpen(false)}
                className="flex-1 mr-2 rounded-xl bg-slate-700 py-3 items-center active:opacity-80"
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreate}
                disabled={creating}
                className={`flex-1 ml-2 rounded-xl bg-sky-600 py-3 items-center ${
                  creating ? 'opacity-60' : 'active:opacity-80'
                }`}
              >
                <Text className="text-white font-semibold">
                  {creating ? 'Creating…' : 'Create'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

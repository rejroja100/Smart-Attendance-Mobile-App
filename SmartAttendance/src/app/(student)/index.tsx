import React, { useState } from 'react';
import {
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
import { ENROLL_LINK_BASE } from '@/utils/constants';

function parseCourseId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.includes('/enroll/')) {
    return trimmed.split('/enroll/').pop()?.split(/[?#]/)[0] ?? '';
  }
  return trimmed;
}

export default function StudentHome(): JSX.Element {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const {
    courses,
    loading,
    refreshing,
    error,
    refresh,
    enroll,
  } = useCourses('student');

  const [modalOpen, setModalOpen] = useState(false);
  const [linkOrId, setLinkOrId] = useState('');
  const [name, setName] = useState(user?.name ?? '');
  const [roll, setRoll] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleJoin = async () => {
    setJoinError(null);
    const courseId = parseCourseId(linkOrId);
    if (!courseId) {
      setJoinError('Please paste an enrollment link or course ID.');
      return;
    }
    if (!name.trim() || !roll.trim()) {
      setJoinError('Please enter your full name and roll number.');
      return;
    }
    setJoining(true);
    try {
      await enroll(courseId, name.trim(), roll.trim());
      setLinkOrId('');
      setRoll('');
      setModalOpen(false);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Failed to join course.');
    } finally {
      setJoining(false);
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
        <View className="ml-2 px-2 py-0.5 rounded-full bg-blue-600/20">
          <Text className="text-blue-300 text-[10px] font-semibold tracking-widest">
            STUDENT
          </Text>
        </View>
        <View className="flex-1" />
        <Pressable
          onPress={() => router.push('/(student)/profile')}
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
        <View className="px-1 flex-row items-center">
          <View className="flex-1">
            <Text className="text-slate-400 text-sm">Welcome,</Text>
            <Text className="text-white text-2xl font-bold">
              {user?.name ?? 'Student'}
            </Text>
          </View>
          <Pressable
            onPress={() => setModalOpen(true)}
            className="px-3 py-2 rounded-xl bg-sky-600 active:opacity-80"
          >
            <Text className="text-white font-semibold">＋ Join</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push('/(student)/dashboard')}
          className="mt-4 rounded-2xl bg-indigo-600 p-4 flex-row items-center active:opacity-90"
        >
          <View className="w-10 h-10 rounded-xl bg-white/15 items-center justify-center">
            <Text className="text-2xl">📊</Text>
          </View>
          <View className="flex-1 ml-3">
            <Text className="text-white font-semibold">Attendance dashboard</Text>
            <Text className="text-white/80 text-xs">
              See your attendance percentage across courses
            </Text>
          </View>
          <Text className="text-white text-xl">→</Text>
        </Pressable>

        <Text className="text-slate-300 text-base font-semibold mt-6 mb-2 px-1">
          Your courses
        </Text>

        <ErrorMessage message={error} onRetry={refresh} />

        {courses.length === 0 ? (
          <View className="items-center mt-12">
            <Text className="text-slate-500 text-4xl">📭</Text>
            <Text className="text-slate-400 mt-3">
              Join a course to get started.
            </Text>
            <Pressable
              onPress={() => setModalOpen(true)}
              className="mt-4 px-4 py-2 rounded-xl bg-sky-600 active:opacity-80"
            >
              <Text className="text-white font-semibold">Join a course</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row flex-wrap">
            {courses.map((course) => (
              <View key={course.id} className="w-1/2">
                <CourseCard
                  course={course}
                  showInstructor
                  onPress={() =>
                    router.push(`/(student)/course/${course.id}` as never)
                  }
                />
              </View>
            ))}
          </View>
        )}

        <View className="h-12" />
      </ScrollView>

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
            <Text className="text-white text-lg font-semibold mb-1">
              Join a course
            </Text>
            <Text className="text-slate-400 text-xs mb-4">
              Paste the enrollment link your teacher sent you, or just the course ID.
            </Text>
            <Text className="text-slate-400 text-xs mb-1">Enrollment link or ID</Text>
            <TextInput
              value={linkOrId}
              onChangeText={setLinkOrId}
              placeholder={`${ENROLL_LINK_BASE}…`}
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
              className="bg-slate-800 text-white rounded-xl px-4 py-3 mb-3"
            />
            <Text className="text-slate-400 text-xs mb-1">Full name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor="#475569"
              className="bg-slate-800 text-white rounded-xl px-4 py-3 mb-3"
            />
            <Text className="text-slate-400 text-xs mb-1">Roll number</Text>
            <TextInput
              value={roll}
              onChangeText={setRoll}
              placeholder="e.g. CSE-001"
              placeholderTextColor="#475569"
              autoCapitalize="characters"
              className="bg-slate-800 text-white rounded-xl px-4 py-3"
            />
            <ErrorMessage message={joinError} />
            <View className="flex-row mt-4">
              <Pressable
                onPress={() => setModalOpen(false)}
                className="flex-1 mr-2 rounded-xl bg-slate-700 py-3 items-center active:opacity-80"
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleJoin}
                disabled={joining}
                className={`flex-1 ml-2 rounded-xl bg-sky-600 py-3 items-center ${
                  joining ? 'opacity-60' : 'active:opacity-80'
                }`}
              >
                <Text className="text-white font-semibold">
                  {joining ? 'Joining…' : 'Join'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

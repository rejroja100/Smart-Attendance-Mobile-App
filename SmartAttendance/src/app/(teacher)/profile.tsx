import React, { useMemo } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { useCourses } from '@/hooks/useCourses';
import { LoadingScreen } from '@/components/LoadingScreen';
import { getInitial, randomColor } from '@/utils/helpers';

export default function TeacherProfile(): JSX.Element {
  const router = useRouter();
  const { user, signOut, signingIn } = useAuth();
  const { courses, loading } = useCourses('teacher');

  const totalStudents = useMemo(
    () => courses.reduce((acc, c) => acc + (c.studentIds?.length ?? 0), 0),
    [courses],
  );

  if (!user) return <LoadingScreen />;

  const handleLogout = async () => {
    await signOut();
    router.replace('/(auth)/role-selection');
  };

  const avatarBg = randomColor(user.uid || user.email);

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <View className="px-5 pt-2 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-slate-800 items-center justify-center active:opacity-80"
        >
          <Text className="text-white text-lg">←</Text>
        </Pressable>
        <Text className="text-white text-lg font-semibold ml-3">Profile</Text>
      </View>

      <ScrollView className="flex-1 px-5 pt-6">
        <View className="items-center mb-6">
          {user.photoURL ? (
            <Image
              source={{ uri: user.photoURL }}
              className="w-28 h-28 rounded-full"
            />
          ) : (
            <View
              className={`w-28 h-28 rounded-full ${avatarBg} items-center justify-center`}
            >
              <Text className="text-white text-4xl font-bold">
                {getInitial(user.name)}
              </Text>
            </View>
          )}
          <Text className="text-white text-2xl font-bold mt-4">{user.name}</Text>
          <Text className="text-slate-400 mt-1">{user.email}</Text>
          <View className="px-3 py-1 rounded-full bg-teal-600/20 mt-3">
            <Text className="text-teal-300 text-xs font-semibold uppercase tracking-widest">
              Teacher
            </Text>
          </View>
        </View>

        <View className="flex-row">
          <View className="flex-1 mr-2 bg-slate-800 rounded-2xl p-4">
            <Text className="text-slate-400 text-xs">Courses created</Text>
            <Text className="text-white text-2xl font-bold mt-1">
              {loading ? '—' : courses.length}
            </Text>
          </View>
          <View className="flex-1 ml-2 bg-slate-800 rounded-2xl p-4">
            <Text className="text-slate-400 text-xs">Total students</Text>
            <Text className="text-white text-2xl font-bold mt-1">
              {loading ? '—' : totalStudents}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={handleLogout}
          disabled={signingIn}
          className="mt-8 mb-10 rounded-xl bg-red-600 py-3 items-center active:opacity-80"
        >
          <Text className="text-white font-semibold">
            {signingIn ? 'Signing out…' : 'Log out'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
